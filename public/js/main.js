var whiteboardId = getQueryVariable("whiteboardid");
whiteboardId = whiteboardId || "myNewWhiteboard";
var myUsername = getQueryVariable("username");
var accessToken = getQueryVariable("accesstoken");
myUsername = myUsername || "unknown" + (Math.random() + "").substring(2, 6);
accessToken = accessToken || "";

var url = document.URL.substr(0, document.URL.lastIndexOf('/'));
var signaling_socket = null;
var urlSplit = url.split("/");
var subdir = "";
for (var i = 3; i < urlSplit.length; i++) {
    subdir = subdir + '/' + urlSplit[i];
}
if (subdir != "") {
    signaling_socket = io("", { "path": subdir + "/socket.io" }); //Connect even if we are in a subdir behind a reverse proxy
} else {
    signaling_socket = io();
}

signaling_socket.on('connect', function () {
    console.log("Websocket connected!");

    signaling_socket.on('drawToWhiteboard', function (content) {
        whiteboard.handleEventsAndData(content, true);
    });

    signaling_socket.on('refreshUserBadges', function () {
        whiteboard.refreshUserBadges();
    });

    signaling_socket.on('wrongAccessToken', function () {
        alert("Access denied! Wrong accessToken!")
    });

    signaling_socket.emit('joinWhiteboard', { wid : whiteboardId, at : accessToken });
});

$(document).ready(function () {
    whiteboard.loadWhiteboard("#whiteboardContainer", { //Load the whiteboard
        whiteboardId: whiteboardId,
        username: myUsername,
        sendFunction: function (content) {
            content["at"] = accessToken;
            signaling_socket.emit('drawToWhiteboard', content);
        }
    });

    // request whiteboard from server
    $.get(subdir + "/loadwhiteboard", { wid: whiteboardId, at : accessToken }).done(function (data) {
        whiteboard.loadData(data)
    });

    /*----------------/
	Whiteboard actions
    /----------------*/

    // whiteboard clear button
    $("#whiteboardTrashBtn").click(function () {
        whiteboard.clearWhiteboard();
    });

    // undo button
    $("#whiteboardUndoBtn").click(function () {
        whiteboard.undoWhiteboardClick();
    });

    // switch tool
    $(".whiteboardTool").click(function () {
        $(".whiteboardTool").removeClass("active");
        $(this).addClass("active");
        var activeTool = $(this).attr("tool");
        whiteboard.setTool(activeTool);
        if(activeTool == "mouse" || activeTool == "recSelect") {
            $(".activeToolIcon").empty();
        } else {
            $(".activeToolIcon").html($(this).html()); //Set Active icon the same as the button icon
        }        
    });

    // upload image button
    $("#addImgToCanvasBtn").click(function () {
        alert("Please drag the image into the browser.");
    });

    // save image to png
    $("#saveAsImageBtn").click(function () {
        var imgData = whiteboard.getImageDataBase64();
        var a = document.createElement('a');
        a.href = imgData;
        a.download = 'whiteboard.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    // save image to json containing steps
    $("#saveAsJSONBtn").click(function () {
        var imgData = whiteboard.getImageDataJson();
        var a = window.document.createElement('a');
        a.href = window.URL.createObjectURL(new Blob([imgData], { type: 'text/json' }));
        a.download = 'whiteboard.json';
        // Append anchor to body.
        document.body.appendChild(a);
        a.click();
        // Remove anchor from body
        document.body.removeChild(a);
    });

    // upload json containing steps
    $("#uploadJsonBtn").click(function () {
        $("#myFile").click();
    });

    // load json to whiteboard
    $("#myFile").on("change", function () {
        var file = document.getElementById("myFile").files[0];
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var j = JSON.parse(e.target.result);
                whiteboard.loadJsonData(j);
            } catch (e) {
                alert("File was not a valid JSON!");
            }
        };
        reader.readAsText(file);
        $(this).val("");
    });

    // On thickness slider change
    $("#whiteboardThicknessSlider").on("change", function () {
        whiteboard.thickness = $(this).val();
    });

    // handle drag&drop
    var dragCounter = 0;
    $('#whiteboardContainer').on("dragenter", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter++;
        whiteboard.dropIndicator.show();
    });

    $('#whiteboardContainer').on("dragleave", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter--;
        if (dragCounter === 0) {
            whiteboard.dropIndicator.hide();
        }
    });

    $('#whiteboardContainer').on('drop', function (e) { //Handle drop
        if (e.originalEvent.dataTransfer) {
            if (e.originalEvent.dataTransfer.files.length) { //File from harddisc
                e.preventDefault();
                e.stopPropagation();

                var filename = e.originalEvent.dataTransfer.files[0]["name"];
                if (isImageFileName(filename)) {
                    var blob = e.originalEvent.dataTransfer.files[0];
                    var reader = new window.FileReader();
                    reader.readAsDataURL(blob);
                    reader.onloadend = function () {
                        base64data = reader.result;
                        uploadImgAndAddToWhiteboard(base64data);
                    }
                } else {
                    console.error("File must be an image!");
                }
            } else { //File from other browser
                var fileUrl = e.originalEvent.dataTransfer.getData('URL');
                var imageUrl = e.originalEvent.dataTransfer.getData('text/html');
                var rex = /src="?([^"\s]+)"?\s*/;
                var url = rex.exec(imageUrl);
                if (url && url.length > 1) {
                    url = url[1];
                } else {
                    url = "";
                }

                isValidImageUrl(fileUrl, function (isImage) {
                    if (isImage && isImageFileName(url)) {
                        whiteboard.addImgToCanvasByUrl(fileUrl);
                    } else {
                        isValidImageUrl(url, function (isImage) {
                            if (isImage) {
                                if (isImageFileName(url)) {
                                    whiteboard.addImgToCanvasByUrl(url);
                                } else {
                                    uploadImgAndAddToWhiteboard(url);
                                }
                            } else {
                                console.error("Can only upload imagedata!");
                            }
                        });
                    }
                });
            }
        }
        dragCounter = 0;
        whiteboard.dropIndicator.hide();
    });

    $('#whiteboardColorpicker').colorPicker({
        renderCallback: function (elm) {
            whiteboard.drawcolor = elm.val();
        }
    });
});

//Prevent site from changing tab on drag&drop
window.addEventListener("dragover", function (e) {
    e = e || event;
    e.preventDefault();
}, false);
window.addEventListener("drop", function (e) {
    e = e || event;
    e.preventDefault();
}, false);

function uploadImgAndAddToWhiteboard(base64data) {
    var date = (+new Date());
    $.ajax({
        type: 'POST',
        url: document.URL.substr(0, document.URL.lastIndexOf('/')) + '/upload',
        data: {
            'imagedata': base64data,
            'whiteboardId': whiteboardId,
            'date': date,
            'at' : accessToken
        },
        success: function (msg) {
            var filename = whiteboardId + "_" + date + ".png";
            whiteboard.addImgToCanvasByUrl(document.URL.substr(0, document.URL.lastIndexOf('/')) + "/uploads/" + filename); //Add image to canvas
            console.log("Image uploaded!");
        },
        error: function (err) {
            console.error("Failed to upload frame: " + JSON.stringify(err));
        }
    });
}

// verify if filename refers to an image
function isImageFileName(filename) {
    var extension = filename.split(".")[filename.split(".").length - 1];
    var known_extensions = ["png", "jpg", "jpeg", "gif", "tiff"];
    return known_extensions.includes(extension.toLowerCase());
}

// verify if given url is url to an image
function isValidImageUrl(url, callback) {
    var img = new Image();
    var timer = null;
    img.onerror = img.onabort = function () {
        clearTimeout(timer);
        callback(false);
    };
    img.onload = function () {
        clearTimeout(timer);
        callback(true);
    };
    timer = setTimeout(function () {
        callback(false);
    }, 2000);
    img.src = url;
}

// handle pasting from clipboard
window.addEventListener("paste", function (e) {
    if (e.clipboardData) {
        var items = e.clipboardData.items;
        if (items) {
            // Loop through all items, looking for any kind of image
            for (var i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    // We need to represent the image as a file,
                    var blob = items[i].getAsFile();

                    var reader = new window.FileReader();
                    reader.readAsDataURL(blob);
                    reader.onloadend = function () {
                        console.log("Uploading image!");
                        base64data = reader.result;
                        uploadImgAndAddToWhiteboard(base64data);
                    }
                }
            }
        }
    }
});

// get 'GET' parameter by variable name
function getQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split("&");
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split("=");
        if (pair[0] == variable) {
            return pair[1];
        }
    }
    return false;
}
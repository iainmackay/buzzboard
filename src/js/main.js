import keymage from "keymage";
import whiteboard from "./whiteboard";
import keybinds from "./keybinds";
import Picker from "vanilla-picker";
import { dom } from "@fortawesome/fontawesome-svg-core";
import shortcutFunctions from "./shortcutFunctions";
import ReadOnlyService from "./services/ReadOnlyService";
import InfoService from "./services/InfoService";
import { getQueryVariable, getSubDir } from "./utils";
import ConfigService from "./services/ConfigService";
import { handlers, receiveMessage, composeMessage } from "../../common/wsutil";

let whiteboardId = getQueryVariable("whiteboardid");
const randomid = getQueryVariable("randomid");
const invitationColor = getQueryVariable("color");
const participantType = getQueryVariable("type");
const token = getQueryVariable("token");

console.log("Loading whiteboard from", window.location, participantType, token);
if (randomid && !whiteboardId) {
  //set random whiteboard on empty whiteboardid
  whiteboardId = Array(2)
    .fill(null)
    .map(() => Math.random().toString(36).substr(2))
    .join("");
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.set("whiteboardid", whiteboardId);
  window.location.search = urlParams;
}

whiteboardId = whiteboardId || "myNewWhiteboard";
// Not sure about this - i8n? semantic delimiters like . or _?
//whiteboardId = unescape(encodeURIComponent(whiteboardId)).replace(/[^a-zA-Z0-9 ]/g, "");
const myUsername = getQueryVariable("username") || "unknown" + (Math.random() + "").substring(2, 6);
const accessToken = getQueryVariable("accesstoken") || "";

// Custom Html Title
const title = getQueryVariable("title");
if (!!title) {
  document.title = title;
}

const subdir = getSubDir();
let signaling_socket;

function setupSocket() {
  const serverURL = window.location.origin.replace("https://", "wss://") + subdir + "/ws-api";
  console.log("Attempting to connect to web socket server at", serverURL);
  signaling_socket = new WebSocket(serverURL);

  signaling_socket.onerror = (event) => {
    console.log("Error connecting to server", event);
    setTimeout(setupSocket, 5000);
    showBasicAlert("Couldn't connect to server. Click OK to attempt reconnection.", {
      noOK: true,
    });
  };

  signaling_socket.onclose = (event) => {
    console.log("Connection to server closed", event);
    signaling_socket = null;
    showBasicAlert("Connection to server lost. Refresh your browser page to retry.", {
      noOK: true,
    });
  };
  handlers["whiteboardConfig"] = (serverResponse) => {
    console.log("whiteboardConfig", serverResponse);
    ConfigService.initFromServer(serverResponse);
    // Init whiteboard only when we have the config from the server
    initWhiteboard(() => {
      handlers["whiteboardInfoUpdate"] = (info) => {
        InfoService.updateInfoFromServer(info);
        whiteboard.updateSmallestScreenResolution();
      };

      handlers["drawToWhiteboard"] = (content) => {
        //console.log("drawToWhiteboard handler", content);
        whiteboard.handleEventsAndData(content, true);
        InfoService.incrementNbMessagesReceived();
      };

      handlers["refreshUserBadges"] = () => {
        whiteboard.refreshUserBadges();
      };

      let accessDenied = false;
      handlers["wrongAccessToken"] = () => {
        if (!accessDenied) {
          accessDenied = true;
          showBasicAlert("Access denied! Wrong accessToken!");
        }
      };
      //console.log("All whiteboard handlers set up");
    });
  };

  signaling_socket.onmessage = (event) => {
    //console.log("Websocket message received", event);
    receiveMessage(signaling_socket, event.data);
  };

  signaling_socket.onopen = (event) => {
    console.log("Websocket connected!", event);

    signaling_socket.send(
      composeMessage("joinWhiteboard", {
        wid: whiteboardId,
        at: accessToken,
        token: token,
        windowWidthHeight: { w: $(window).width(), h: $(window).height() },
      })
    );
    //console.log("Join whiteboard message sent");
  };
}

function main() {
  setupSocket();
}

function showBasicAlert(html, newOptions) {
  var options = Object.assign(
    {
      header: "INFO MESSAGE",
      okBtnText: "Ok",
      headercolor: "#d25d5d",
      hideAfter: false,
      onOkClick: false,
      noOK: false,
    },
    newOptions
  );
  var alertHtml = $(
    '<div class="basicalert" style="position:absolute; left:0px; width:100%; top:70px; font-family: monospace;">' +
      '<div style="width: 30%; margin: auto; background: #aaaaaa; border-radius: 5px; font-size: 1.2em; border: 1px solid gray;">' +
      '<div style="border-bottom: 1px solid #676767; background: ' +
      options["headercolor"] +
      '; padding-left: 5px; font-size: 0.8em;">' +
      options["header"] +
      '<div style="float: right; margin-right: 4px; color: #373737; cursor: pointer;" class="closeAlert">x</div></div>' +
      '<div style="padding: 10px;" class="htmlcontent"></div>' +
      (options.noOK
        ? ""
        : '<div style="height: 20px; padding: 10px;"><' +
          '<button class="modalBtn okbtn" style="float: right;">' +
          options["okBtnText"] +
          "</button></div>") +
      "</div>" +
      "</div>"
  );
  alertHtml.find(".htmlcontent").append(html);
  $("body").append(alertHtml);
  alertHtml.find(".okbtn").click(function () {
    if (options.onOkClick) {
      options.onOkClick();
    }
    alertHtml.remove();
  });
  alertHtml.find(".closeAlert").click(function () {
    alertHtml.remove();
  });

  if (options.hideAfter) {
    setTimeout(function () {
      alertHtml.find(".okbtn").click();
    }, 1000 * options.hideAfter);
  }
}

function initWhiteboard(onReady) {
  // by default set in readOnly mode
  ReadOnlyService.activateReadOnlyMode();

  whiteboard.loadWhiteboard("#whiteboardContainer", {
    //Load the whiteboard
    whiteboardId: whiteboardId,
    //username: btoa(myUsername),
    username: myUsername,
    participantType: participantType,
    sendFunction: function (content) {
      if (ReadOnlyService.readOnlyActive) return;
      //console.log("Sending message", content);
      //ADD IN LATER THROUGH CONFIG
      // if (content.t === 'cursor') {
      //	 if (whiteboard.drawFlag) return;
      // }
      content["at"] = accessToken;
      content["u"] = myUsername;
      content["p"] = participantType;
      signaling_socket.send(composeMessage("drawToWhiteboard", content));
      InfoService.incrementNbMessagesSent();
    },
  });

  // request whiteboard from server
  $.get(subdir + "/api/loadwhiteboard", {
    wid: whiteboardId,
    at: accessToken,
    token: token,
  }).done(function (data) {
    whiteboard.loadData(data);
  });

  $(window).resize(function () {
    signaling_socket.send(
      composeMessage("updateScreenResolution", {
        at: accessToken,
        windowWidthHeight: { w: $(window).width(), h: $(window).height() },
      })
    );
  });

  // Whiteboard title

  $("#whiteboardTitle")
    .text(title)
    .attr({ style: `color:${invitationColor}` });

  /*----------------/
	Whiteboard actions
	/----------------*/

  var tempLineTool = false;
  var strgPressed = false;
  //Handle key actions

  if (participantType !== "observer") {
    $(document).on("keydown", function (e) {
      if (e.which == 16) {
        if (whiteboard.tool == "pen" && !strgPressed) {
          tempLineTool = true;
          whiteboard.ownCursor.hide();
          if (whiteboard.drawFlag) {
            whiteboard.mouseup({
              offsetX: whiteboard.prevPos.x,
              offsetY: whiteboard.prevPos.y,
            });
            shortcutFunctions.setTool_line();
            whiteboard.mousedown({
              offsetX: whiteboard.prevPos.x,
              offsetY: whiteboard.prevPos.y,
            });
          } else {
            shortcutFunctions.setTool_line();
          }
        }
        whiteboard.pressedKeys["shift"] = true; //Used for straight lines...
      } else if (e.which == 17) {
        strgPressed = true;
      }
      //console.log(e.which);
    });
    $(document).on("keyup", function (e) {
      if (e.which == 16) {
        if (tempLineTool) {
          tempLineTool = false;
          shortcutFunctions.setTool_pen();
          whiteboard.ownCursor.show();
        }
        whiteboard.pressedKeys["shift"] = false;
      } else if (e.which == 17) {
        strgPressed = false;
      }
    });

    //Load keybindings from keybinds.js to given functions
    Object.entries(keybinds).forEach(([key, functionName]) => {
      const associatedShortcutFunction = shortcutFunctions[functionName];
      if (associatedShortcutFunction) {
        keymage(key, associatedShortcutFunction, { preventDefault: true });
      } else {
        console.error(
          "Function you want to keybind on key:",
          key,
          "named:",
          functionName,
          "is not available!"
        );
      }
    });
  }

  // whiteboard clear button
  if (participantType === "internal") {
    $("#whiteboardTrashBtn").click(function () {
      $("#whiteboardTrashBtnConfirm").show().focus();
      $(this).css({ visibility: "hidden" });
    });

    $("#whiteboardTrashBtnConfirm").mouseout(function () {
      $(this).hide();
      $("#whiteboardTrashBtn").css({ visibility: "inherit" });
    });

    $("#whiteboardTrashBtnConfirm").click(function () {
      $(this).hide();
      $("#whiteboardTrashBtn").css({ visibility: "inherit" });
      whiteboard.clearWhiteboard();
    });
  } else {
    $("#whiteboardTrashBtn").css({ display: "none" });
  }

  if (participantType !== "observer") {
    // undo button
    $("#whiteboardUndoBtn").click(function () {
      whiteboard.undoWhiteboardClick();
    });

    // redo button
    $("#whiteboardRedoBtn").click(function () {
      whiteboard.redoWhiteboardClick();
    });
  } else {
    $("#whiteboardUndoBtn").css({ display: "none" });
    $("#whiteboardRedoBtn").css({ display: "none" });
  }

  // view only
  if (false) {
    $("#whiteboardLockBtn").click(() => {
      ReadOnlyService.deactivateReadOnlyMode();
    });
    $("#whiteboardUnlockBtn").click(() => {
      ReadOnlyService.activateReadOnlyMode();
    });
    $("#whiteboardUnlockBtn").hide();
    $("#whiteboardLockBtn").show();
  } else {
    $(".lockGroup").css({ display: "none" });
  }

  // switch tool
  if (participantType !== "observer") {
    $(".whiteboard-tool").click(function () {
      const activeNow = $(this).hasClass("active");
      $(".whiteboard-tool").removeClass("active");
      if (activeNow) {
        whiteboard.setTool();
      } else {
        $(this).addClass("active");
        var activeTool = $(this).attr("tool");
        whiteboard.setTool(activeTool);
        if (activeTool == "mouse" || activeTool == "recSelect") {
          $(".activeToolIcon").empty();
        } else {
          $(".activeToolIcon").html($(this).html()); //Set Active icon the same as the button icon
        }
      }
    });
    $(".select-tool").css({ display: "none" }); // Too flakey
    if (participantType === "participant") {
      $(".eraser-tool").css({ display: "none" });
      $(".mouse-tool").css({ display: "none" });
    }
  } else {
    $(".whiteboard-tool").css({ display: "none" });
  }

  if (participantType == "internal") {
    // upload image button
    $("#addImgToCanvasBtn").click(function () {
      if (ReadOnlyService.readOnlyActive) return;
      showBasicAlert("Please drag the image into the browser.");
    });
  } else {
    $("#addImgToCanvasBtn").css({ display: "none" });
  }

  if (participantType !== "participant") {
    // save image as image
    $("#saveAsImageBtn").click(function () {
      whiteboard.getImageDataBase64(ConfigService.imageDownloadFormat, function (imgData) {
        var w = window.open("about:blank"); //Firefox will not allow downloads without extra window
        setTimeout(function () {
          //FireFox seems to require a setTimeout for this to work.
          var a = document.createElement("a");
          a.href = imgData;
          a.download = "whiteboard." + ConfigService.imageDownloadFormat;
          w.document.body.appendChild(a);
          a.click();
          w.document.body.removeChild(a);
          setTimeout(function () {
            w.close();
          }, 100);
        }, 0);
      });
    });
  } else {
    $("#saveAsImageBtn").css({ display: "none" });
  }

  if (false) {
    // save image to json containing steps
    $("#saveAsJSONBtn").click(function () {
      var imgData = whiteboard.getImageDataJson();

      var w = window.open("about:blank"); //Firefox will not allow downloads without extra window
      setTimeout(function () {
        //FireFox seems to require a setTimeout for this to work.
        var a = document.createElement("a");
        a.href = window.URL.createObjectURL(new Blob([imgData], { type: "text/json" }));
        a.download = "whiteboard.json";
        w.document.body.appendChild(a);
        a.click();
        w.document.body.removeChild(a);
        setTimeout(function () {
          w.close();
        }, 100);
      }, 0);
    });

    // upload json containing steps
    $("#uploadJsonBtn").click(function () {
      $("#myFile").click();
    });
  } else {
    $("#saveAsJSONBtn").css({ display: "none" });
    $("#uploadJsonBtn").css({ display: "none" });
  }

  if (false) {
    $("#shareWhiteboardBtn").click(function () {
      var url = window.location.href;
      var s = url.indexOf("&username=") !== -1 ? "&username=" : "username="; //Remove username from url
      var urlSlpit = url.split(s);
      var urlStart = urlSlpit[0];
      if (urlSlpit.length > 1) {
        var endSplit = urlSlpit[1].split("&");
        endSplit = endSplit.splice(1, 1);
        urlStart += "&" + endSplit.join("&");
      }
      $("<textarea/>")
        .appendTo("body")
        .val(urlStart)
        .select()
        .each(function () {
          document.execCommand("copy");
        })
        .remove();
      showBasicAlert("Copied Whiteboard-URL to clipboard.", { hideAfter: 2 });
    });
  } else {
    $("#shareWhiteboardBtn").css({ display: "none" });
  }

  if (false) {
    $("#displayWhiteboardInfoBtn").click(() => {
      InfoService.toggleDisplayInfo();
    });
  } else {
    $("#displayWhiteboardInfoBtn").css({ display: "none" });
  }

  var btnsMini = false;
  if (participantType !== "observer") {
    $("#minMaxBtn").click(function () {
      if (!btnsMini) {
        $("#toolbar").find(".btn-group:not(.minGroup)").hide();
        $(this).find("#minBtn").hide();
        $(this).find("#maxBtn").show();
      } else {
        $("#toolbar").find(".btn-group").show();
        $(this).find("#minBtn").show();
        $(this).find("#maxBtn").hide();
      }
      btnsMini = !btnsMini;
    });
  } else {
    $(".minGroup").css({ display: "none" });
  }

  // load json to whiteboard
  if (false) {
    $("#myFile").on("change", function () {
      var file = document.getElementById("myFile").files[0];
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var j = JSON.parse(e.target.result);
          whiteboard.loadJsonData(j);
        } catch (e) {
          showBasicAlert("File was not a valid JSON!");
        }
      };
      reader.readAsText(file);
      $(this).val("");
    });
  }

  if (participantType !== "observer") {
    // On thickness slider change
    $("#whiteboardThicknessSlider").on("input", function () {
      if (ReadOnlyService.readOnlyActive) return;
      whiteboard.setStrokeThickness($(this).val());
    });
  } else {
    $(".thickColor").css({ display: "none" });
  }

  // handle drag&drop
  var dragCounter = 0;
  $("#whiteboardContainer").on("dragenter", function (e) {
    if (ReadOnlyService.readOnlyActive || participantType !== "internal") return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    whiteboard.dropIndicator.show();
  });

  $("#whiteboardContainer").on("dragleave", function (e) {
    if (ReadOnlyService.readOnlyActive || participantType !== "internal") return;

    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
      whiteboard.dropIndicator.hide();
    }
  });

  $("#whiteboardContainer").on("drop", function (e) {
    //Handle drop
    if (ReadOnlyService.readOnlyActive || participantType !== "internal") return;

    if (e.originalEvent.dataTransfer) {
      if (e.originalEvent.dataTransfer.files.length) {
        //File from harddisc
        e.preventDefault();
        e.stopPropagation();
        var filename = e.originalEvent.dataTransfer.files[0]["name"];
        if (isImageFileName(filename)) {
          var blob = e.originalEvent.dataTransfer.files[0];
          var reader = new window.FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = function () {
            const base64data = reader.result;
            uploadImgAndAddToWhiteboard(base64data);
          };
        } else if (isPDFFileName(filename)) {
          //Handle PDF Files
          var blob = e.originalEvent.dataTransfer.files[0];

          var reader = new window.FileReader();
          reader.onloadend = function () {
            var pdfData = new Uint8Array(this.result);

            var loadingTask = pdfjsLib.getDocument({ data: pdfData });
            loadingTask.promise.then(
              function (pdf) {
                console.log("PDF loaded");

                var currentDataUrl = null;
                var modalDiv = $(
                  "<div>" +
                    "Page: <select></select> " +
                    '<button style="margin-bottom: 3px;" class="modalBtn"><i class="fas fa-upload"></i> Upload to Whiteboard</button>' +
                    '<img style="width:100%;" src=""/>' +
                    "</div>"
                );

                modalDiv.find("select").change(function () {
                  showPDFPageAsImage(parseInt($(this).val()));
                });

                modalDiv.find("button").click(function () {
                  if (currentDataUrl) {
                    $(".basicalert").remove();
                    uploadImgAndAddToWhiteboard(currentDataUrl);
                  }
                });

                for (var i = 1; i < pdf.numPages + 1; i++) {
                  modalDiv.find("select").append('<option value="' + i + '">' + i + "</option>");
                }

                showBasicAlert(modalDiv, {
                  header: "Pdf to Image",
                  okBtnText: "cancel",
                  headercolor: "#0082c9",
                });

                showPDFPageAsImage(1);
                function showPDFPageAsImage(pageNumber) {
                  // Fetch the page
                  pdf.getPage(pageNumber).then(function (page) {
                    console.log("Page loaded");

                    var scale = 1.5;
                    var viewport = page.getViewport({ scale: scale });

                    // Prepare canvas using PDF page dimensions
                    var canvas = $("<canvas></canvas>")[0];
                    var context = canvas.getContext("2d");
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    // Render PDF page into canvas context
                    var renderContext = {
                      canvasContext: context,
                      viewport: viewport,
                    };
                    var renderTask = page.render(renderContext);
                    renderTask.promise.then(function () {
                      var dataUrl = canvas.toDataURL("image/jpeg", 1.0);
                      currentDataUrl = dataUrl;
                      modalDiv.find("img").attr("src", dataUrl);
                      console.log("Page rendered");
                    });
                  });
                }
              },
              function (reason) {
                // PDF loading error

                showBasicAlert("Error loading pdf as image! Check that this is a vaild pdf file!");
                console.error(reason);
              }
            );
          };
          reader.readAsArrayBuffer(blob);
        } else {
          showBasicAlert("File must be an image!");
        }
      } else {
        //File from other browser

        var fileUrl = e.originalEvent.dataTransfer.getData("URL");
        var imageUrl = e.originalEvent.dataTransfer.getData("text/html");
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
                if (isImageFileName(url) || url.startsWith("http")) {
                  whiteboard.addImgToCanvasByUrl(url);
                } else {
                  uploadImgAndAddToWhiteboard(url); //Last option maybe its base64
                }
              } else {
                showBasicAlert("Can only upload Imagedata!");
              }
            });
          }
        });
      }
    }
    dragCounter = 0;
    whiteboard.dropIndicator.hide();
  });

  if (false) {
    new Picker({
      parent: $("#whiteboardColorpicker")[0],
      color: invitationColor,
      onChange: function (color) {
        whiteboard.setDrawColor(color.rgbaString);
      },
    });
  } else {
    $("#whiteboardColorpicker").css({ display: "none" });
  }
  whiteboard.setDrawColor(invitationColor);

  // on startup select mouse
  //shortcutFunctions.setTool_mouse();
  // fix bug cursor not showing up
  whiteboard.refreshCursorAppearance();

  if (process.env.NODE_ENV === "production") {
    if (ConfigService.readOnlyOnWhiteboardLoad) ReadOnlyService.activateReadOnlyMode();
    else ReadOnlyService.deactivateReadOnlyMode();

    if (ConfigService.displayInfoOnWhiteboardLoad) InfoService.displayInfo();
    else InfoService.hideInfo();
  } else {
    // in dev
    ReadOnlyService.deactivateReadOnlyMode();
    InfoService.displayInfo();
  }

  if (participantType === "observer") {
    ReadOnlyService.activateReadOnlyMode();
    InfoService.hideInfo();
  }
  InfoService.hideInfo();

  //Prevent site from changing tab on drag&drop
  window.addEventListener(
    "dragover",
    function (e) {
      e = e || event;
      e.preventDefault();
    },
    false
  );
  window.addEventListener(
    "drop",
    function (e) {
      e = e || event;
      e.preventDefault();
    },
    false
  );

  function uploadImgAndAddToWhiteboard(base64data) {
    var date = +new Date();
    $.ajax({
      type: "POST",
      url: document.URL.substr(0, document.URL.lastIndexOf("/")) + "/api/upload",
      data: {
        imagedata: base64data,
        whiteboardId: whiteboardId,
        date: date,
        at: accessToken,
      },
      success: function (URL) {
        whiteboard.addImgToCanvasByUrl(URL);
        console.log("Image uploaded!");
      },
      error: function (err) {
        console.log("Failed to upload image to", URL, err);
        showBasicAlert("Failed to upload to server");
      },
    });
  }

  // verify if filename refers to an image
  function isImageFileName(filename) {
    var extension = filename.split(".")[filename.split(".").length - 1];
    var known_extensions = ["png", "jpg", "jpeg", "gif", "tiff", "bmp", "webp"];
    return known_extensions.includes(extension.toLowerCase());
  }

  // verify if filename refers to an pdf
  function isPDFFileName(filename) {
    var extension = filename.split(".")[filename.split(".").length - 1];
    var known_extensions = ["pdf"];
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
    if ($(".basicalert").length > 0) {
      return;
    }
    if (e.clipboardData) {
      var items = e.clipboardData.items;
      var imgItemFound = false;
      if (items) {
        // Loop through all items, looking for any kind of image
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            imgItemFound = true;
            // We need to represent the image as a file,
            var blob = items[i].getAsFile();

            var reader = new window.FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = function () {
              console.log("Uploading image!");
              let base64data = reader.result;
              uploadImgAndAddToWhiteboard(base64data);
            };
          }
        }
      }

      if (!imgItemFound && whiteboard.tool != "text") {
        showBasicAlert(
          "Please Drag&Drop the image or pdf into the Whiteboard. (Browsers don't allow copy+past from the filesystem directly)"
        );
      }
    }
  });

  // Expose the whiteboard in all its glory
  enableHtml();
  if (onReady) onReady();
}

export default main;

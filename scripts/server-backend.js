const path = require("path");
const config = require("./config/config");
const URLPrefix = config.frontend.URLPrefix;

const WhiteboardServerSideInfo = require("./WhiteboardServerSideInfo");

/**
 * @type {Map<string, WhiteboardServerSideInfo>}
 */
const infoByWhiteboard = new Map();

function startBackendServer(port) {
    var fs = require("fs-extra");
    var express = require("express");
    var formidable = require("formidable"); //form upload processing

    const createDOMPurify = require("dompurify"); //Prevent xss
    const { JSDOM } = require("jsdom");
    const window = new JSDOM("").window;
    const DOMPurify = createDOMPurify(window);
	const got = require ("got");

    const { createClient } = require("webdav");

    var s_whiteboard = require("./s_whiteboard.js");

    var app = express();
    app.use(URLPrefix, express.static(path.join(__dirname, "..", "dist")));
    //app.use(URLPrefix + "/uploads", express.static(path.join(__dirname, "..", "public", "uploads")));
    var server = require("http").Server(app);
    server.listen(port);
    var io = require("socket.io")(server, { path: URLPrefix + "/ws-api" });
    console.log("Webserver & socketserver running on port:" + port);

    const { accessToken, enableWebdav } = config.backend;
    const { imageDownloadFormat } = config.frontend;

    app.get(URLPrefix + "/api/loadwhiteboard", function (req, res) {
        var wid = req["query"]["wid"];
        var at = req["query"]["at"]; //accesstoken
        if (accessToken === "" || accessToken == at) {
			s_whiteboard.loadStoredData(wid)
			.then ((ret) => {
				res.send(ret);
				res.end ();
			})
			.catch ((e) => {
				if (e.status == 404) {
					console.log ("First open of board", wid);
				} else {
					console.log ("Error loading board", e);
				}
				res.send ([]);
				res.end ();
			})
			;
        } else {
            res.status(401); //Unauthorized
            res.end();
        }
    });

    app.post(URLPrefix + "/api/upload", function (req, res) {
        //File upload
        var form = new formidable.IncomingForm(); //Receive form
        var formData = {
            files: {},
            fields: {},
        };

        form.on("file", function (name, file) {
            formData["files"][file.name] = file;
        });

        form.on("field", function (name, value) {
            formData["fields"][name] = value;
        });

        form.on("error", function (err) {
            console.log("File upload Error!");
        });

        form.on("end", function () {
            if (accessToken === "" || accessToken == formData["fields"]["at"]) {
				progressUploadFormData (formData)
				.then ((url) => {
					console.log ("Image uploaded to", url);
					res.send (url);
				})
				.catch ((err) => {
					if (err == "403") {
						res.status(403);
					} else {
						res.status(500);
					}
					res.end();
					console.log ("Image upload failed", err);
				})
				;
            } else {
                res.status(401); //Unauthorized
                res.end();
            }
            //End file upload
        });
        form.parse(req);
    });
	app.all ("*", (req, res) => {
		console.log ("Unmatched request", req.url);
		res.status (400);
	});

    async function progressUploadFormData(formData) {
        var fields = escapeAllContentStrings(formData.fields);
        var whiteboardId = fields["whiteboardId"];

        var name = fields["name"] || "";
        var date = fields["date"] || + new Date();
        var filename = date + "." + imageDownloadFormat;
		var imagedata = fields["imagedata"];
		if (imagedata && imagedata != "") {
			//Save from base64 data
			imagedata = imagedata
				.replace(/^data:image\/png;base64,/, "")
				.replace(/^data:image\/jpeg;base64,/, "");
			return await saveImageToWebdav(
				imagedata,
				filename,
				whiteboardId,
				function (err) {
					if (err) {
						console.log("error", err);
						callback(err);
					} else {
						callback();
					}
				}
			);
		} else {
			console.log("No image Data found for this upload!", name);
			throw new Error (400);
		}
    }

    async function saveImageToWebdav(
		imageData,
		filename,
		whiteboardId) {
		const whiteboardServerSideInfo = infoByWhiteboard.get(whiteboardId);
		const client = whiteboardServerSideInfo.webdavClient;
		const path = whiteboardServerSideInfo.webdavPath;
		const webdavPath = `${path}/${filename}`;
		const imagePath = whiteboardServerSideInfo.webdavURL (filename);
		console.log ("Save image to webdav", imagePath);
		await client.putFileContents (webdavPath, Buffer.from (imageData, 'base64'));
		return imagePath;
	}

    setInterval(() => {
        infoByWhiteboard.forEach((info, whiteboardId) => {
            if (info.shouldSendInfo()) {
                io.sockets
                    .in(whiteboardId)
                    .compress(false)
                    .emit("whiteboardInfoUpdate", info.asObject());
                info.infoWasSent();
            }
        });
    }, (1 / config.backend.performance.whiteboardInfoBroadcastFreq) * 1000);

    io.on("connection", function (socket) {
        var whiteboardId = null;
        socket.on("disconnect", function () {
            if (infoByWhiteboard.has(whiteboardId)) {
                const whiteboardServerSideInfo = infoByWhiteboard.get(whiteboardId);

                if (socket && socket.id) {
                    whiteboardServerSideInfo.deleteScreenResolutionOfClient(socket.id);
                }

                whiteboardServerSideInfo.decrementNbConnectedUsers();

                if (whiteboardServerSideInfo.hasConnectedUser()) {
                    socket.compress(false).broadcast.emit("refreshUserBadges", null); //Removes old user Badges
                } else {
                    infoByWhiteboard.delete(whiteboardId);
                }
            }
        });

        socket.on("drawToWhiteboard", function (content) {
            content = escapeAllContentStrings(content);
            if (accessToken === "" || accessToken == content["at"]) {
                socket.compress(false).broadcast.to(whiteboardId).emit("drawToWhiteboard", content); //Send to all users in the room (not own socket)
                s_whiteboard.handleEventsAndData(content); //save whiteboardchanges on the server
            } else {
                socket.emit("wrongAccessToken", true);
            }
        });

        socket.on("joinWhiteboard", function (content) {
            content = escapeAllContentStrings(content);
            if (accessToken === "" || accessToken == content["at"]) {
				whiteboardId = content["wid"];
				socket.join(whiteboardId); //Joins room name=wid
				if (!infoByWhiteboard.has(whiteboardId)) {
					infoByWhiteboard.set(whiteboardId, new WhiteboardServerSideInfo());
				}
				const whiteboardServerSideInfo = infoByWhiteboard.get(whiteboardId);
				got.post (
					config.backend.tokenService +
					"/token/key/" +
					config.backend.whiteboardToken +
					"/decode-token", {
						json: {token: content.token},
						responseType: "json"
					}
				).then ((response) => {
					const payload = response.body;
					console.log ("Verified token as", payload)
					whiteboardServerSideInfo.setWebdav (
						payload.host,
						payload.user,
						payload.pass,
						payload.path
					);
					console.log ("Webdav credentials", payload.user, payload.pass);
					s_whiteboard.setWebdav (whiteboardId,
						whiteboardServerSideInfo.webdavClient, payload.path//,
						//whiteboardServerSideInfo.webdavURL
					);
					console.log ("Whiteboard token verified");
					socket.emit("whiteboardConfig", { common: config.frontend });
					whiteboardServerSideInfo.incrementNbConnectedUsers();
					whiteboardServerSideInfo.setScreenResolutionForClient(
						socket.id,
						content["windowWidthHeight"] || WhiteboardServerSideInfo.defaultScreenResolution
					);
				}).catch ((error) => {
					console.log ("Failed to verify token", content.wid, "error", error);
				})
            } else {
                socket.emit("wrongAccessToken", true);
            }
        });

        socket.on("updateScreenResolution", function (content) {
            content = escapeAllContentStrings(content);
            if (accessToken === "" || accessToken == content["at"]) {
                const whiteboardServerSideInfo = infoByWhiteboard.get(whiteboardId);
                whiteboardServerSideInfo.setScreenResolutionForClient(
                    socket.id,
                    content["windowWidthHeight"] || WhiteboardServerSideInfo.defaultScreenResolution
                );
            }
        });
    });

    //Prevent cross site scripting (xss)
    function escapeAllContentStrings(content, cnt) {
		return content;
		// This is too aggressive 
        if (!cnt) cnt = 0;

        if (typeof content === "string") {
            return DOMPurify.sanitize(content);
        }
        for (var i in content) {
            if (typeof content[i] === "string") {
                content[i] = DOMPurify.sanitize(content[i]);
            }
            if (typeof content[i] === "object" && cnt < 10) {
                content[i] = escapeAllContentStrings(content[i], ++cnt);
            }
        }
        return content;
    }

    process.on("unhandledRejection", (error) => {
        // Will print "unhandledRejection err is not defined"
        console.log("unhandledRejection", error.message);
    });
	s_whiteboard.initialise ();
}

module.exports = startBackendServer;

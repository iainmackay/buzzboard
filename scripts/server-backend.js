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
  const got = require("got");
  const ws = require("ws");

  const { createClient } = require("webdav");

  var s_whiteboard = require("./s_whiteboard.js");
  const {
    handlers,
    receiveMessage,
    composeMessage,
    joinRoom,
    leaveRoom,
    rooms,
    clients,
	stableSort
  } = require("../common/wsutil");

  var app = express();
  reqId = 0;

  app.all("*", (req, res, next) => {
    req.reqId = ++reqId;
    //console.log("Starting to handle request", reqId, req.method, req.url);
    next();
  });

  app.use(URLPrefix, express.static(path.join(__dirname, "..", "dist")));
  //app.use(URLPrefix + "/uploads", express.static(path.join(__dirname, "..", "public", "uploads")));
  var server = require("http").Server(app);
  server.listen(port);

  /* server.on ("upgrade", (req, socket, head) => {
		console.log ("Websocket upgrade request for", req.reqId);
	}); */

  // Set up web socket server
  var wss = new ws.Server({ server: server, path: URLPrefix + "/ws-api" });
  console.log("Webserver & web socketserver running on port:" + port);
  let connectionCount = 0;
  let currentConnections = {};

  // Support keep alive protocol
  function noop() {}
  function heartbeat() {
    this.isAlive = true;
  }
  let pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        console.log("Terminating failed client", ws.clientId);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping(noop);
    });
  }, 30000); // Ping every 30 seconds

  wss.on("close", () => {
    console.log("Closing web socket server");
    clearInterval(pingInterval);
  });

  const { accessToken, enableWebdav } = config.backend;
  const { imageDownloadFormat } = config.frontend;

  app.get(URLPrefix + "/api/loadwhiteboard", function (req, res) {
    var wid = req["query"]["wid"];
    var at = req["query"]["at"]; //accesstoken
    if (accessToken === "" || accessToken == at) {
      s_whiteboard
        .loadStoredData(wid)
        .then((ret) => {
          res.send(ret);
          res.end();
        })
        .catch((e) => {
          const response = e.response;
          if (response) {
            if (response.status == 404) {
              console.log("First open of board", wid);
            } else {
              console.log("Error loading board", response);
            }
          } else {
            console.log("Error accessing webdav server", e);
          }
          res.send([]);
          res.end();
        });
    } else {
      res.status(401); //Unauthorized
      res.end();
    }
  });

  app.post(URLPrefix + "/api/deletewhiteboard", function (req, res) {
    var wid = req["query"]["wid"];
    var at = req["query"]["at"]; //accesstoken
    if (accessToken === "" || accessToken == at) {
      s_whiteboard.delete(wid);
      res.end();
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
      console.log("File upload Error!", err);
    });

    form.on("end", function () {
      if (accessToken === "" || accessToken == formData["fields"]["at"]) {
        progressUploadFormData(formData)
          .then((url) => {
            console.log("Image uploaded to", url);
            res.send(url);
          })
          .catch((err) => {
            if (err == "403") {
              res.status(403);
            } else {
              res.status(500);
            }
            res.end();
            console.log("Image upload failed", err);
          });
      } else {
        res.status(401); //Unauthorized
        res.end();
      }
      //End file upload
    });
    form.parse(req);
  });
  app.all("*", (req, res) => {
    console.log("Unmatched request", req.method, URLPrefix, req.url);
    res.status(400);
    res.end();
  });

  async function progressUploadFormData(formData) {
    var fields = escapeAllContentStrings(formData.fields);
    var whiteboardId = fields["whiteboardId"];

    var name = fields["name"] || "";
    var date = fields["date"] || +new Date();
    var filename = date + "." + imageDownloadFormat;
    var imagedata = fields["imagedata"];
    if (imagedata && imagedata != "") {
      //Save from base64 data
      imagedata = imagedata
        .replace(/^data:image\/png;base64,/, "")
        .replace(/^data:image\/jpeg;base64,/, "");
      return await saveImageToWebdav(imagedata, filename, whiteboardId, function (err) {
        if (err) {
          console.log("error", err);
          callback(err);
        } else {
          callback();
        }
      });
    } else {
      console.log("No image Data found for this upload!", name);
      throw new Error(400);
    }
  }

  async function saveImageToWebdav(imageData, filename, whiteboardId) {
    const whiteboardServerSideInfo = infoByWhiteboard.get(whiteboardId);
    const client = whiteboardServerSideInfo.webdavClient;
    const path = whiteboardServerSideInfo.webdavPath;
    const webdavPath = `${path}/${filename}`;
    const imagePath = whiteboardServerSideInfo.webdavURL(filename);
    console.log("Save image to webdav", imagePath);
    await client.putFileContents(webdavPath, Buffer.from(imageData, "base64"));
    return imagePath;
  }

  setInterval(() => {
    infoByWhiteboard.forEach((info, whiteboardId) => {
      if (info.shouldSendInfo()) {
        /* io.sockets
                    .in(whiteboardId)
                    .compress(false)
                    .emit("whiteboardInfoUpdate", info.asObject()); */
        info.infoWasSent();
      }
    });
  }, (1 / config.backend.performance.whiteboardInfoBroadcastFreq) * 1000);

  wss.on("connection", function (ws) {
    ws.isAlive = true;
    ws.on("pong", heartbeat);

    ws.clientId = ++connectionCount;
    currentConnections[ws.clientId] = ws;
    //console.log("New websocket client", ws.clientId);

    ws.broadcast = function (message) {
      //console.log("Broadcasting", ws.clientId, clients, rooms, message);
      if (ws.clientId) {
        const myRoomId = clients[this.clientId];
        if (myRoomId) {
          const members = rooms[myRoomId];
          if (members) {
            members.forEach((clientId) => {
              connection = currentConnections[clientId];
              if (connection) {
                if (clientId !== this.clientId && connection.readyState === ws.OPEN)
                  connection.send(message);
              } else {
                console.log("Can't find client", clientId, message);
              }
            });
          } else {
            console.log(
              "Attempt to broadcast to whiteboard with no members",
              this.clientId,
              myRoomId,
              message
            );
          }
        } else {
          console.log(
            "Attempt to broadcast to non-existent whiteboard id",
            this.clientId,
            myRoomId,
            message
          );
        }
      } else {
        console.log("Attempt to broadcast from client with no id");
      }
    }.bind(ws);

    var whiteboardId = null;
    ws.on("close", function () {
      if (infoByWhiteboard.has(whiteboardId)) {
        const whiteboardServerSideInfo = infoByWhiteboard.get(whiteboardId);

        if (ws && ws.id) {
          whiteboardServerSideInfo.deleteScreenResolutionOfClient(ws.id);
        }

        whiteboardServerSideInfo.decrementNbConnectedUsers();

        if (whiteboardServerSideInfo.hasConnectedUser()) {
          ws.broadcast(composeMessage("refreshUserBadges"));
        } else {
			s_whiteboard.storeData (whiteboardId)
			.then (() => {
				infoByWhiteboard.delete(whiteboardId);
				console.log ("Last client signed off from whiteboard", whiteboardId);
			});
        }
        leaveRoom(whiteboardId, this.clientId);
      }
    });
    ws.on("message", function (message) {
      receiveMessage(ws, message);
    });

    handlers["drawToWhiteboard"] = function (content) {
      content = escapeAllContentStrings(content);
      if (accessToken === "" || accessToken == content["at"]) {
        //socket.compress(false).broadcast.to(whiteboardId).emit("drawToWhiteboard", content); //Send to all users in the room (not own socket)
        s_whiteboard.handleEventsAndData(content); //save whiteboardchanges on the server
        this.broadcast(composeMessage("drawToWhiteboard", content));
      } else {
        this.send(composeMessage("wrongAccessToken", true));
      }
    };

    handlers["joinWhiteboard"] = function (content) {
      console.log("Join of whiteboard received from", this.clientId, content);
      content = escapeAllContentStrings(content);
      if (accessToken === "" || accessToken == content["at"]) {
        whiteboardId = content["wid"];
        let whiteboardServerSideInfo = infoByWhiteboard.get(whiteboardId);
        const deliverConfiguration = () => {
          console.log("Attempting to send configuration message", this.readyState, ws.OPEN);
          this.send(composeMessage("whiteboardConfig", { common: config.frontend }));
          whiteboardServerSideInfo.incrementNbConnectedUsers();
          whiteboardServerSideInfo.setScreenResolutionForClient(
            this.clientId,
            content["windowWidthHeight"] || WhiteboardServerSideInfo.defaultScreenResolution
          );
          joinRoom(whiteboardId, this.clientId);
        };
        if (whiteboardServerSideInfo) {
          deliverConfiguration();
        } else {
		console.log(`Needing to load whiteboard ${whiteboardId} for first client`);
          whiteboardServerSideInfo = new WhiteboardServerSideInfo();
          infoByWhiteboard.set(whiteboardId, whiteboardServerSideInfo);
          got
            .post(
              config.backend.tokenService +
                "/token/key/" +
                config.backend.whiteboardToken +
                "/decode-token",
              {
                json: { token: content.token },
                responseType: "json",
              }
            )
            .then((response) => {
              const payload = response.body;
              //console.log("Verified token as", payload);
              whiteboardServerSideInfo.setWebdav(
                payload.host,
                payload.user,
                payload.pass,
                payload.path
              );
              //console.log("Webdav credentials", payload.user, payload.pass);
              s_whiteboard.setWebdav(
                whiteboardId,
                whiteboardServerSideInfo.webdavClient,
                payload.path //,
                //whiteboardServerSideInfo.webdavURL
              );
              console.log("Whiteboard token verified");
              deliverConfiguration();
            })
            .catch((error) => {
              console.log("Failed to verify token", content.wid, "error", error);
            });
        }
      } else {
        this.send(composeMessage("wrongAccessToken", true));
      }
    };

    handlers["updateScreenResolution"] = function (content) {
      content = escapeAllContentStrings(content);
      if (accessToken === "" || accessToken == content["at"]) {
        const whiteboardServerSideInfo = infoByWhiteboard.get(whiteboardId);
        whiteboardServerSideInfo.setScreenResolutionForClient(
          this.clientId,
          content["windowWidthHeight"] || WhiteboardServerSideInfo.defaultScreenResolution
        );
      }
    };
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
  s_whiteboard.initialise();
}

module.exports = startBackendServer;

//This file is for saving the whiteboard. Persisted in webdav, cached in memory.

var savedBoards = {};
var savedUndos = {};
var savedWebdavs = {};
module.exports = {
	// Not verifying user entitlement to post content presently
    handleEventsAndData: function (content) {
        var tool = content["t"]; //Tool used
        var wid = content["wid"]; //whiteboard ID
        var username = content["username"];
        if (tool === "clear") {
            //Clear the whiteboard
            delete savedBoards[wid];
            delete savedUndos[wid];
        } else if (tool === "undo") {
            //Undo an action
            if (!savedUndos[wid]) {
                savedUndos[wid] = [];
            }
            if (savedBoards[wid]) {
                for (var i = savedBoards[wid].length - 1; i >= 0; i--) {
                    if (savedBoards[wid][i]["username"] == username) {
                        var drawId = savedBoards[wid][i]["drawId"];
                        for (var i = savedBoards[wid].length - 1; i >= 0; i--) {
                            if (
                                savedBoards[wid][i]["drawId"] == drawId &&
                                savedBoards[wid][i]["username"] == username
                            ) {
                                savedUndos[wid].push(savedBoards[wid][i]);
                                savedBoards[wid].splice(i, 1);
                            }
                        }
                        break;
                    }
                }
                if (savedUndos[wid].length > 1000) {
                    savedUndos[wid].splice(0, savedUndos[wid].length - 1000);
                }
            }
        } else if (tool === "redo") {
            if (!savedUndos[wid]) {
                savedUndos[wid] = [];
            }
            if (!savedBoards[wid]) {
                savedBoards[wid] = [];
            }
            for (var i = savedUndos[wid].length - 1; i >= 0; i--) {
                if (savedUndos[wid][i]["username"] == username) {
                    var drawId = savedUndos[wid][i]["drawId"];
                    for (var i = savedUndos[wid].length - 1; i >= 0; i--) {
                        if (
                            savedUndos[wid][i]["drawId"] == drawId &&
                            savedUndos[wid][i]["username"] == username
                        ) {
                            savedBoards[wid].push(savedUndos[wid][i]);
                            savedUndos[wid].splice(i, 1);
                        }
                    }
                    break;
                }
            }
        } else if (
            [
                "line",
                "pen",
                "rect",
                "circle",
                "eraser",
                "addImgBG",
                "recSelect",
                "eraseRec",
                "addTextBox",
                "setTextboxText",
                "removeTextbox",
                "setTextboxPosition",
                "setTextboxFontSize",
                "setTextboxFontColor",
            ].includes(tool)
        ) {
            //Save all this actions
            if (!savedBoards[wid]) {
                savedBoards[wid] = [];
            }
            delete content["wid"]; //Delete id from content so we don't store it twice
            if (tool === "setTextboxText") {
                for (var i = savedBoards[wid].length - 1; i >= 0; i--) {
                    //Remove old textbox text -> dont store it twice
                    if (
                        savedBoards[wid][i]["t"] === "setTextboxText" &&
                        savedBoards[wid][i]["d"][0] === content["d"][0]
                    ) {
                        savedBoards[wid].splice(i, 1);
                    }
                }
            }
            savedBoards[wid].push(content);
        }
    },
	// loadStoredData returns a promise to load
    loadStoredData: async function (wid, serverSideInfo) {
        //Load saved whiteboard
		const board = savedBoards [wid], wd = savedWebdavs [wid];
		const boardFilepath = `${wd.path}/${encodeURIComponent(wid)}.json`
		console.log ("loadStoredData (if exists) from", boardFilepath);
		if (board) {
			return board
		} else {
			return await wd.client.getFileContents (boardFilepath);
		}
    },
	setWebdav: function (wid, client, path) {
		savedWebdavs [wid] = {client, path}
	}
};

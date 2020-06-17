//This file is for saving the whiteboard. Persisted at intervals in webdav, cached in memory.

let savedBoards = {};
let savedUndos = {};
let savedWebdavs = {};
let eventCounts = {};
let lastCheckpoints = {};

async function saveBoard (wid) {
		const board = savedBoards [wid], wd = savedWebdavs [wid];
		//const boardFilepath = `${wd.path}/${encodeURIComponent(wid)}.json`;
		const boardFilepath = `${wd.path}/${wid}.json`;
		console.log (`Saving board '${wid}' to ${boardFilepath}`);
		await wd.client.putFileContents (boardFilepath, 
			JSON.stringify (board));
};

async function saveBoardIfNecessary (wid) {
	const board = savedBoards [wid];
	const count = eventCounts [wid];
	const lastCheckpoint = lastCheckpoints [wid];
	//console.log ("Board", wid, savedBoards [wid].length, count, lastCheckpoint);
	if (count > lastCheckpoint) {
		saveBoard (wid)
		.then (() => {
			lastCheckpoints [wid] = count;
			//console.log (`Checkpointed board ${wid} at change ${count}`);
		})
		.catch ((err) => {
			console.log (`Failed to checkpoint board ${wid} at change ${count}: ${err}`);
		});
		;
	}
}

function saveTimer () {
		// if any changes since last save, upload the board to webdav
		for (const wid in savedBoards) {
			saveBoardIfNecessary (wid)
		}
		saveTimeout = setTimeout (saveTimer, 60000);
}

module.exports = {
	// Not verifying user entitlement to post content presently
    handleEventsAndData: function (content) {
        var tool = content["t"]; //Tool used
        var wid = content["wid"]; //whiteboard ID
 		if (!["cursor", "mouse"].includes (tool)) {
			//console.log ("Whiteboard change event", content);
			if (savedBoards[wid]) {
				eventCounts [wid] += 1;
			}
		}
        var username = content["username"];
        if (tool === "clear") {
            //Clear the whiteboard
            delete savedBoards[wid];
            delete savedUndos[wid];
			delete eventCounts[wid];
			delete lastCheckpoints[wid];
			savedBoards [wid] = [];
			savedUndos [wid] = [];
			eventCounts [wid] = 0;
			lastCheckpoints [wid] = 0;
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
				"tick",
				"cross"
            ].includes(tool)
        ) {
            //Save all these actions
            if (!savedBoards[wid]) {
                savedBoards[wid] = [];
            }
            delete content["wid"]; //Delete id from content so we don't store it redundantly
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
    loadStoredData: async function (wid) {
        //Load saved whiteboard
		const board = savedBoards [wid], wd = savedWebdavs [wid];
		const boardFilepath = `${wd.path}/${wid}.json`
		if (board) {
			return board
		} else {
			console.log ("loadStoredData (if exists) from", boardFilepath);
			eventCounts [wid] = 0;
			lastCheckpoints [wid] = 0;
			const boardJSON = await wd.client.getFileContents (boardFilepath, {format: "text"})
			//console.log ("Board retrieved as", typeof boardJSON, boardJSON);
			savedBoards [wid] = boardJSON;
			return savedBoards [wid];
		}
    },
	// Delete any cached version of a board, prior to deleting board folder
	delete: function (wid) {
		delete savedBoards [wid];
		delete savedWebdavs [wid];
		delete lastCheckpoints [wid];
		delete eventCounts [wid];
		delete savedUndos [wid];
		console.log ("Cached board deleted:", wid);
	},
	setWebdav: function (wid, client, path) {
		savedWebdavs [wid] = {client, path}
	},
	initialise: function () {
		saveTimer ();
		console.log ("Initialising whiteboard persistence manager");
	}
};

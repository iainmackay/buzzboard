// Should be a class when it grows up

module.exports = (() => {
	let handlers = {};
	let clients = {};
	let rooms = {};

const textTools = [
	"addTextBox",
	"setTextboxText",
	"removeTextbox",
	"setTextboxPosition",
	"setTextboxFontSize",
	"setTextboxFontColor",
];

	function receiveMessage(ws, messageJSON) {
		/* let messageJSON;
		if (clientside) {
			messageJSON = messageObject.data;
			console.log ("Message received from server", messageJSON);
		} else {
			messageJSON = messageObject;
			console.log ("Message received from client", ws.clientId, messageJSON);
		}
		let message; */
		try {
			message = JSON.parse(messageJSON);
			if (handlers[message.type]) {
				try {
					//console.log ("Receiving message", message, ws.clientId);
					handlers[message.type].bind(ws)(message.details);
				} catch (e) {
					console.log("Failed to processMessage", message, e);
				}
			} else {
				console.log("Unknown or premature message", message);
			}
		} catch {
			console.log("Failed to parse server message", messageJSON);
		}
	}

	function composeMessage(messageType, details) {
		//console.log ("Composed message", messageType, details);
		return JSON.stringify({
			type: messageType,
			details: details,
		});
	}

	function joinRoom(roomId, clientId) {
		let room = rooms[roomId];
		if (!room) rooms[roomId] = room = [];
		room.push(clientId);
		clients[clientId] = roomId;
	}

	function leaveRoom(roomId, clientId) {
		if (rooms[roomId]) {
			rooms[roomId] = rooms[roomId].filter((x) => x !== clientId);
			if (!rooms[roomId].length) delete rooms[roomId];
		}
		if (clients[clientId]) delete clients[clientId];
	}
	
	const stableSort = (arr, compare) => arr
		.map((item, index) => ({item, index}))
		.sort((a, b) => compare(a.item, b.item) || a.index - b.index)
		.map(({item}) => item)
	;

	return {
		handlers,
		rooms,
		clients,
		receiveMessage,
		composeMessage,
		joinRoom,
		leaveRoom,
		stableSort,
		textTools
	};
})();

const config = require("./config/config");
const { createClient } = require("webdav");

/**
 * Class to hold information related to a whiteboard
 */
class WhiteboardServerSideInfo {
    static defaultScreenResolution = { w: 1280, h: 720 };

    constructor() {
        /**
         * @type {number}
         * @private
         */
        this._nbConnectedUsers = 0;

        /**
         * @type {Map<int, {w: number, h: number}>}
         * @private
         */
        this._screenResolutionByClients = new Map();

        /**
         * Variable to tell if these info have been sent or not
         *
         * @private
         * @type {boolean}
         */
        this._hasNonSentUpdates = false;
		
		/**
		 * Host for webdav folder for persisting whiteboard content
         *
         * @private
         * @type {string}
         */
        this._webdavHost = null;
		
		/**
		 * Username for webdav folder for persisting whiteboard content
         *
         * @private
         * @type {string}
         */
        this._webdavUser = null;
		
		/**
		 * Password for webdav folder for persisting whiteboard content
         *
         * @private
         * @type {string}
         */
        this._webdavPass = null;
		
		/**
		 * Path to webdav folder for persisting whiteboard content
         *
         * @private
         * @type {string}
         */
        this._webdavPath = null;
		
		/**
		 * Webdav client for this whiteboard
         *
         * @private
         * @type {string}
         */
        this._webdavClient = null;
    }

    incrementNbConnectedUsers() {
        this._nbConnectedUsers++;
        this._hasNonSentUpdates = true;
    }

    decrementNbConnectedUsers() {
        this._nbConnectedUsers--;
        this._hasNonSentUpdates = true;
    }

    hasConnectedUser() {
        return this._nbConnectedUsers > 0;
    }

    /**
     * Store information about the client's screen resolution
     *
     * @param {number} clientId
     * @param {number} w client's width
     * @param {number} h client's hight
     */
    setScreenResolutionForClient(clientId, { w, h }) {
        this._screenResolutionByClients.set(clientId, { w, h });
        this._hasNonSentUpdates = true;
    }

    /**
     * Delete the stored information about the client's screen resoltion
     * @param clientId
     */
    deleteScreenResolutionOfClient(clientId) {
        this._screenResolutionByClients.delete(clientId);
        this._hasNonSentUpdates = true;
    }

    /**
     * Get the smallest client's screen size on a whiteboard
     * @return {{w: number, h: number}}
     */
    getSmallestScreenResolution() {
        const { _screenResolutionByClients: resolutions } = this;
        return {
            w: Math.min(...Array.from(resolutions.values()).map((res) => res.w)),
            h: Math.min(...Array.from(resolutions.values()).map((res) => res.h)),
        };
    }

    /**
     * Save webdav parameters
     *
     * @param {string} webdav host
     * @param {string} webdav username
     * @param {string} webdav password
     * @param {string} webdav folder
     */
    setWebdav (host, username, password, path) {
		this._webdavHost = host;
		this._webdavUser = username;
		this._webdavPass = password;
		this._webdavPath = path;
		this._webdavClient = createClient ("https://" + host, {
			username: username,
			password: password,
		});
		this._webdavURL = (filename, includeAuth) => {
			const filepath = `${this._webdavPath}/${filename}`;
			const fileURLPath = filepath.split ("/").map (encodeURIComponent).join ("/");
			const auth = includeAuth?(`${this._webdavUser}:${this._webdavPass}@`):"";
			return `https://${auth}${host}${fileURLPath}`;
		}
		console.log ("Specimen webdav URL", this._webdavURL ("(1)/(2)"), this._webdavURL ("(1)/(2)", true));
	}
	
	get webdavClient () {
		return this._webdavClient
	}
	
	get webdavHost () {
		return this._webdavHost
	}
	
	get webdavPath () {
		return this._webdavPath
	}
	
	get webdavURL () {
		return this._webdavURL
	}

    infoWasSent() {
        this._hasNonSentUpdates = false;
    }

    shouldSendInfo() {
        return this._hasNonSentUpdates;
    }

    asObject() {
        const out = {
            nbConnectedUsers: this._nbConnectedUsers,
        };

        if (config.frontend.showSmallestScreenIndicator) {
            out.smallestScreenResolution = this.getSmallestScreenResolution();
        }

        return out;
    }
}

module.exports = WhiteboardServerSideInfo;

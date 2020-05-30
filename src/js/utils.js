/**
 * Compute the euclidean distance between two points
 * @param {Point} p1
 * @param {Point} p2
 */
export function computeDist(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

/**
 * Return the current time in ms since 1970
 * @returns {number}
 */
export function getCurrentTimeMs() {
    return new Date().getTime();
}

/**
 * get 'GET' parameter by variable name
 * @param variable
 * @return {boolean|*}
 */
export function getQueryVariable(variable) {
    const query = window.location.search.substring(1);
    const vars = query.split("&");
    for (let i = 0; i < vars.length; i++) {
        const pair = vars[i].split("=");
		if (pair.length == 2) {
			const name = decodeURIComponent (pair [0]);
			const value = decodeURIComponent (pair [1]);
			if (name == variable) {
				console.log (`Query variable '${name}'='${value}'`);
				return value;
			}
		}
    }
    return false;
}

export function getSubDir() {
    const url = document.URL.substr(0, document.URL.lastIndexOf("/"));
    const urlSplit = url.split("/");
    let subdir = "";
    for (let i = 3; i < urlSplit.length; i++) {
        subdir = subdir + "/" + urlSplit[i];
    }

    return subdir;
}

// Per https://stackoverflow.com/questions/105034/how-to-create-guid-uuid
// Invent a UUID
export function generateUUID() { // Public Domain/MIT
	var d = getCurrentTimeMs();
    var d2 = (performance && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16;//random number between 0 and 16
        if(d > 0){//Use timestamp until depleted
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {//Use microseconds since page-load if supported
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}
export function escapeHTML (unsafe) {
  return unsafe.replace(/[&<"']/g, function(m) {
    switch (m) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#039;';
    }
  });
};
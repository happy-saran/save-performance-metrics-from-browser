let isValid = true;

const data = {
	resources: [],
	marks: [],
	measures: [],
	perfTiming: [],
	allResourcesCalc: [],
	isValid: () => isValid
};

//extract a resources file type
const getFileType = (fileExtension, initiatorType) => {
	if (fileExtension) {
		switch (fileExtension) {
			case "jpg":
			case "jpeg":
			case "png":
			case "gif":
			case "webp":
			case "svg":
			case "ico":
				return "image";
			case "js":
				return "js"
			case "css":
				return "css"
			case "html":
				return "html"
			case "woff":
			case "woff2":
			case "ttf":
			case "eot":
			case "otf":
				return "font"
			case "swf":
				return "flash"
			case "map":
				return "source-map"
		}
	}
	if (initiatorType) {
		switch (initiatorType) {
			case "xmlhttprequest":
				return "ajax"
			case "img":
				return "image"
			case "script":
				return "js"
			case "internal":
			case "iframe":
				return "html" //actual page
			default:
				return "other"
		}
	}
	return initiatorType;
};

const endsWith = (str, suffix) => {
	return str.indexOf(suffix, str.length - suffix.length) !== -1;
};

//counts occurrences of items in array arr and returns them as array of key valure pairs
//keyName overwrites the name of the key attribute
const getItemCount = (arr, keyName) => {
	let counts = {},
		resultArr = [],
		obj;

	arr.forEach((key) => {
		counts[key] = counts[key] ? counts[key] + 1 : 1;
	});

	//pivot data
	for (let fe in counts) {
		obj = {};
		obj[keyName || "key"] = fe;
		obj.count = counts[fe];

		resultArr.push(obj);
	}
	return resultArr.sort((a, b) => {
		return a.count < b.count ? 1 : -1;
	});
};


const supportsFeatures = () => {
	//Check if the browser suppots the timing APIs
	if (window.performance && window.performance.getEntriesByType !== undefined) {
		data.resources = window.performance.getEntriesByType("resource");
		data.marks = window.performance.getEntriesByType("mark");
		data.measures = window.performance.getEntriesByType("measure");
	} else if (window.performance && window.performance.webkitGetEntriesByType !== undefined) {
		data.resources = window.performance.webkitGetEntriesByType("resource");
		data.marks = window.performance.webkitGetEntriesByType("mark");
		data.measures = window.performance.webkitGetEntriesByType("measure");
	} else {
		console.error("Oups, looks like this browser does not support the Resource Timing API\ncheck http://caniuse.com/#feat=resource-timing to see the ones supporting it \n\n");
		return false;
	}

	if (window.performance.timing) {
		data.perfTiming = window.performance.timing;
	} else {
		console.error("Oups, looks like this browser does not support performance timing");
		return false;
	}

	if (data.perfTiming.loadEventEnd - data.perfTiming.navigationStart < 0) {
		console.error("Page is still loading - please try again when page is loaded.");
		return false;
	}
	return true;
};

window.onload = function () {
	console.log('page loaded - now get metrics and upload');

	isValid = supportsFeatures();

	data.allResourcesCalc = data.resources
		//remove this bookmarklet from the result
		.filter((currR) => !currR.name.match(/http[s]?\:\/\/(micmro|nurun).github.io\/performance-bookmarklet\/.*/))
		.map((currR, i, arr) => {
			//crunch the resources data into something easier to work with
			const isRequest = currR.name.indexOf("http") === 0;
			let urlFragments, maybeFileName, fileExtension;

			if (isRequest) {
				urlFragments = currR.name.match(/:\/\/(.[^/]+)([^?]*)\??(.*)/);
				maybeFileName = urlFragments[2].split("/").pop();
				fileExtension = maybeFileName.substr((Math.max(0, maybeFileName.lastIndexOf(".")) || Infinity) + 1);
			} else {
				urlFragments = ["", location.host];
				fileExtension = currR.name.split(":")[0];
			}

			const currRes = {
				name: currR.name,
				domain: urlFragments[1],
				initiatorType: currR.initiatorType || fileExtension || "SourceMap or Not Defined",
				fileExtension: fileExtension || "XHR or Not Defined",
				loadtime: currR.duration,
				fileType: getFileType(fileExtension, currR.initiatorType),
				isRequestToHost: urlFragments[1] === location.host
			};

			for (let attr in currR) {
				if (typeof currR[attr] !== "function") {
					currRes[attr] = currR[attr];
				}
			}

			if (currR.requestStart) {
				currRes.requestStartDelay = currR.requestStart - currR.startTime;
				currRes.dns = currR.domainLookupEnd - currR.domainLookupStart;
				currRes.tcp = currR.connectEnd - currR.connectStart;
				currRes.ttfb = currR.responseStart - currR.startTime;
				currRes.requestDuration = currR.responseStart - currR.requestStart;
			}
			if (currR.secureConnectionStart) {
				currRes.ssl = currR.connectEnd - currR.secureConnectionStart;
			}

			return currRes;
		});

	//filter out non-http[s] and sourcemaps
	data.requestsOnly = data.allResourcesCalc.filter((currR) => {
		return currR.name.indexOf("http") === 0 && !currR.name.match(/js.map$/);
	});


	//get counts
	data.initiatorTypeCounts = getItemCount(data.requestsOnly.map((currR, i, arr) => {
		return currR.initiatorType || currR.fileExtension;
	}), "initiatorType");

	data.initiatorTypeCountHostExt = getItemCount(data.requestsOnly.map((currR, i, arr) => {
		return (currR.initiatorType || currR.fileExtension) + " " + (currR.isRequestToHost ? "(host)" : "(external)");
	}), "initiatorType");

	data.requestsByDomain = getItemCount(data.requestsOnly.map((currR, i, arr) => currR.domain), "domain");

	data.fileTypeCountHostExt = getItemCount(data.requestsOnly.map((currR, i, arr) => {
		return currR.fileType + " " + (currR.isRequestToHost ? "(host)" : "(external)");
	}), "fileType");

	data.fileTypeCounts = getItemCount(data.requestsOnly.map((currR, i, arr) => currR.fileType), "fileType");

	const tempResponseEnd = {};
	//TODO: make immutable
	data.requestsOnly.forEach((currR) => {
		const entry = data.requestsByDomain.filter((a) => a.domain == currR.domain)[0] || {};

		const lastResponseEnd = tempResponseEnd[currR.domain] || 0;

		currR.duration = entry.duration || (currR.responseEnd - currR.startTime);

		if (lastResponseEnd <= currR.startTime) {
			entry.durationTotalParallel = (entry.durationTotalParallel || 0) + currR.duration;
		} else if (lastResponseEnd < currR.responseEnd) {
			entry.durationTotalParallel = (entry.durationTotalParallel || 0) + (currR.responseEnd - lastResponseEnd);
		}
		tempResponseEnd[currR.domain] = currR.responseEnd || 0;
		entry.durationTotal = (entry.durationTotal || 0) + currR.duration;
	});


	//Request counts
	data.hostRequests = data.requestsOnly
		.filter((domain) => domain.domain === location.host).length;

	data.currAndSubdomainRequests = data.requestsOnly
		.filter((domain) => domain.domain.split(".").slice(-2).join(".") === location.host.split(".").slice(-2).join("."))
		.length;

	data.crossDocDomainRequests = data.requestsOnly
		.filter((domain) => !endsWith(domain.domain, document.domain)).length;

	data.hostSubdomains = data.requestsByDomain
		.filter((domain) => endsWith(domain.domain, location.host.split(".").slice(-2).join(".")) && domain.domain !== location.host)
		.length;


	data.slowestCalls = [];
	data.average = undefined;

	if (data.allResourcesCalc.length > 0) {
		data.slowestCalls = data.allResourcesCalc
			.filter((a) => a.name !== location.href)
			.sort((a, b) => b.duration - a.duration);

		data.average = Math.floor(data.slowestCalls.reduceRight((a, b) => {
			if (typeof a !== "number") {
				return a.duration + b.duration
			}
			return a + b.duration;
		}) / data.slowestCalls.length);
	}
	console.log('page loaded -send data to api  ', (data));

	console.info('Now have an API call here to store the data to backend');
}

// ==UserScript==
// @name        Bsky "Clink'n'Save" mini
// @description Bsky image saver, minimal edition
// @namespace   gh.alttiri
// @version     0.0.7-2025.04.25
// @match       https://bsky.app/*
// @grant       GM_xmlhttpRequest
// @supportURL  https://github.com/AlttiRi/bsky-click-and-save/issues
// @downloadURL https://github.com/AlttiRi/bsky-click-and-save/raw/refs/heads/master/bsky-click-and-save.user.js
// @license     GPL-3.0
// ==/UserScript==


// THE MOST SIMPLE USERSCRIPT FOR IMAGE DOWNLOADING FROM BSKY.

// Right mouse click ("Context Menu" event) to download an image.

// https://github.com/AlttiRi/twitter-click-and-save/issues/47
// https://github.com/AlttiRi/bsky-click-and-save


const fetch = GM_fetch;


// The substrings that are required to remove (replace with " ") to make the date string able to be parsed.
const dateGarbageParts = [
    " at ", // [english] "November 18, 2024 at 11:44 AM" [bad] -> "November 18, 2024 11:44 AM" [ok]
];

addCSS(`
.ujs-downloading {
    height: 100%;
    box-shadow: inset 0px 0px 10px rgba(0, 0, 0, 0.2);
    position: relative;
    z-index: 1;
}
.ujs-downloaded {
    height: 100%;
    box-shadow: inset 0px 0px 10px rgba(0, 0, 0, 0.5);
    position: relative;
    z-index: 1;
}
.height100 {
    height: 100%;
}
`);

const ws = new WeakSet();
setInterval(() => {
    const elems = [...document.querySelectorAll(`img[src^="https://cdn.bsky.app/img/feed_thumbnail/"]`)];
    const elemsFiltered = elems.filter(el => !ws.has(el));
    if (elemsFiltered.length) {
        // console.log(elemsFiltered);
    }

    elemsFiltered.forEach(el => {
        el.addEventListener("contextmenu", ev => {
            ev.preventDefault();
            // console.log("click", el);
            const postElem = el.closest(`[role="link"]`);
            if (!postElem) {
                return;
            }
            const postLink = postElem.querySelector(`a[href^="/profile/"][dir="auto"][data-tooltip]`);
            if (!postLink) {
                return;
            }

            // console.log(el.src);
            const imageLink = el.src.replace("/feed_thumbnail/", "/feed_fullsize/");
            let filename = imageLink.match(/[^\/]+$/)?.[0];
            if (!filename) {
                return;
            }
            filename = filename.replace("@", ".");
            if (filename.endsWith("jpeg")) {
                filename = filename.replace(/jpeg$/, "jpg");
            }


            // console.log("postLink", postLink);
            const hrefAttr = postLink.getAttribute("href");
            const ariaLabel = postLink.getAttribute("aria-label");

            function parseDate(ariaLabel) {
                // console.log("parseDate", ariaLabel);
                let dateString = ariaLabel;
                for (const part of dateGarbageParts) {
                    dateString = dateString.replace(part, " "); // fix "Invalid Date"
                }
                return new Date(dateString).toString();
            }

            function parseInfo(hrefAttr) {
                return hrefAttr.match(/\/profile\/(?<profile>[^\/]+)\/post\/(?<post>[^\/]+)/)?.groups || {};
            }

            const dateParsed = parseDate(ariaLabel);
            const date = dateParsed === "Invalid Date" ? "" : dateParsed;
            const {profile, post} = parseInfo(hrefAttr);

            const dateStr = date ? "—" + dateToDayDateString(date) : "";

            const filenameResult = `[bsky] ${profile}${dateStr}—${post}—${filename}`;
            // console.log("filename", filenameResult);

            void (async function download(url, filename) {
                const shadowElem = document.createElement("div");
                shadowElem.classList.add("ujs-downloading");
                el.parentElement.classList.add("height100");
                el.after(shadowElem);
                try {
                    const resp = await fetch(url);
                    const blob = await resp.blob();
                    downloadBlob(blob, filename, url);

                    shadowElem.classList.remove("ujs-downloading");
                    shadowElem.classList.add("ujs-downloaded");
                    await sleep(500);
                } finally {
                    shadowElem.remove();
                    el.parentElement.classList.remove("height100");
                }
            })(imageLink, filenameResult);
        });
    });

    elemsFiltered.forEach(el => {
        ws.add(el);
    })
}, 1200);



// === GM UTIL === //

async function GM_fetch(url, {method = "get", headers} = {}) {
    return new Promise((resolve, _reject) => {
        const blobPromise = new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                url,
                method,
                headers,
                responseType: "blob",
                onload: response => resolve(response.response),
                onerror: reject,
                ontimeout: reject,
                onreadystatechange: onHeadersReceived
            });
        });
        blobPromise.catch(_reject);
        function onHeadersReceived(response) {
            const {
                readyState, responseHeaders, status, statusText
            } = response;
            if (readyState === 2) { // HEADERS_RECEIVED
                const headers = parseHeaders(responseHeaders);
                resolve({
                    headers,
                    status,
                    statusText,
                    ok: status.toString().startsWith("2"),
                    arrayBuffer: () => blobPromise.then(blob => blob.arrayBuffer()),
                    blob: () => blobPromise,
                    json: () => blobPromise.then(blob => blob.text()).then(text => JSON.parse(text)),
                    text: () => blobPromise.then(blob => blob.text()),
                });
            }
        }
    });
}
function parseHeaders(headersString) {
    class Headers {
        get(key) {
            return this[key.toLowerCase()];
        }
    }
    const headers = new Headers();
    for (const line of headersString.trim().split("\n")) {
        const [key, ...valueParts] = line.split(":"); // last-modified: Fri, 21 May 2021 14:46:56 GMT
        headers[key.trim().toLowerCase()] = valueParts.join(":").trim();
    }
    return headers;
}


// === UTIL === //

function downloadBlob(blob, name = "", urlOrOpts) {
    const anchor = document.createElement("a");
    anchor.setAttribute("download", name || "");
    const blobUrl = URL.createObjectURL(blob);
    let url;
    let timeout = 5000;
    if (isString(urlOrOpts)) {
        url = urlOrOpts;
    }
    else {
        url = urlOrOpts?.url;
        timeout = urlOrOpts?.timeout || timeout;
    }
    anchor.href = blobUrl + (url ? ("#" + url) : "");
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), timeout);
}

function dateToDayDateString(dateValue, utc = true) {
    return formatDate(dateValue, "YYYY.MM.DD", utc);
}
function formatDate(dateValue = new Date(), pattern = "YYYY.MM.DD", utc = true) {
    dateValue = firefoxDateFix(dateValue);
    const date = new Date(dateValue);
    if (date.toString() === "Invalid Date") {
        console.warn("Invalid Date value: ", dateValue);
    }
    const formatter = new DateFormatter(date, utc);
    return pattern.replaceAll(/YYYY|YY|MM|DD|HH|mm|SS/g, (...args) => {
        const property = args[0];
        return formatter[property];
    });
}
function firefoxDateFix(dateValue) {
    if (isString(dateValue)) {
        return dateValue.replace(/(?<y>\d{4})\.(?<m>\d{2})\.(?<d>\d{2})/, "$<y>-$<m>-$<d>");
    }
    return dateValue;
}
function isString(value) {
    return typeof value === "string";
}
function pad0(value, count = 2) {
    return value.toString().padStart(count, "0");
}
class DateFormatter {
    constructor(date = new Date(), utc = true) {
        this.date = date;
        this.utc = utc ? "UTC" : "";
    }
    get SS() { return pad0(this.date[`get${this.utc}Seconds`]()); }
    get mm() { return pad0(this.date[`get${this.utc}Minutes`]()); }
    get HH() { return pad0(this.date[`get${this.utc}Hours`]()); }
    get MM() { return pad0(this.date[`get${this.utc}Month`]() + 1); }
    get DD() { return pad0(this.date[`get${this.utc}Date`]()); }
    get YYYY() { return pad0(this.date[`get${this.utc}FullYear`](), 4); }
    get YY() { return this.YYYY.slice(2); }
}


function addCSS(css) {
    const styleElem = document.createElement("style");
    styleElem.textContent = css;
    document.body.append(styleElem);
    return styleElem;
}
function sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

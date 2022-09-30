/*
事前準備
1. https://developer.spotify.com/dashboard/applications でアプリ作成
2. clientID と clientSecret をスクリプトプロパティに保存
3. https://accounts.spotify.com/authorize?response_type=code&redirect_uri=https://example.com/callback&client_id={ID} で code 発行
4. 3で発行した authorizationCode をスクリプトプロパティに保存
*/
function main() {
  const today = new Date();
  setTrigger(today);

  const items = getPlaylistTracks(PropertiesService.getScriptProperties().getProperty("playlistID"));
  writeSheets(items);
  sendMessage(today, items);
}

function setTrigger(today) {
  if (today == undefined) {
    today = new Date();
  }
  const time = new Date(today.getTime() + (1000 * 60 * 60 * 24));
  time.setHours(9);
  time.setMinutes(0);
  time.setSeconds(0);
  ScriptApp.newTrigger('main').timeBased().at(time).create();
}

function getPlaylistTracks(playlistID, offset = 0) {
  const limit = 100;
  const options = {
    "method": "get",
    "headers": {
      "Authorization": "Bearer " + PropertiesService.getScriptProperties().getProperty("accessToken")
    },
    "muteHttpExceptions": true,
  }

  const response = UrlFetchApp.fetch(
    "https://api.spotify.com/v1/playlists/" + playlistID + "/tracks?limit=" + limit + "&offset=" + offset,
    options
  );
  switch (response.getResponseCode()) {
    case 200:
      // 101件目以降を再帰で取得
      let tracks = JSON.parse(response);
      if (tracks.next != null) {
        tracks.items = tracks.items.concat(getPlaylistTracks(playlistID, limit + offset));
      }
      return tracks.items;
    case 401:
      refreshAccessToken();
      return getPlaylistTracks(playlistID);
  }
  return null;
}

function writeSheets(items) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.clear();
  sheet.appendRow(['name', 'artists', 'URL', 'release_date', 'added_at']);

  const r = [];
  for (let key in items) {
    r.push(
      [
        items[key].track.name,
        items[key].track.artists.map((row) => { return [row['name']] }).join(','),
        items[key].track.external_urls.spotify,
        items[key].track.album.release_date,
        items[key].added_at,
      ]
    )
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, r.length, r[0].length).setValues(r);
}

function sendMessage(today, items) {
  const yesterday = new Date(today.getTime() - (1000 * 60 * 60 * 24));

  let message = "";
  for (let key in items) {
    if (isSameDate(yesterday, new Date(items[key].added_at))) {
      message = message +
        "* <" + items[key].track.external_urls.spotify + "|" +
        items[key].track.artists.map((row) => { return [row['name']] }).join(',') + "/" +
        items[key].track.name + ">\n";
    }
  }

  if (message != "") {
    message = "昨日見つけた東京だよ\n" + message;
    postMessage(message);
  }
}

function isSameDate(date1, date2) {
  return date1.getFullYear() == date2.getFullYear() &&
    date1.getMonth() == date2.getMonth() &&
    date1.getDate() == date2.getDate();
}

function fetchToken() {
  // 同一 authorization_code での Token発行は1回だけしかできない
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty("accessToken") !== "") {
    return p.getProperty("accessToken");
  }

  const clientID = p.getProperty("clientID");
  const clientSecret = p.getProperty("clientSecret");
  const headers = {
    "Authorization": "Basic " + Utilities.base64Encode(clientID + ":" + clientSecret)
  };
  const payload = {
    "grant_type": "authorization_code",
    "code": p.getProperty("authorizationCode"),
    "redirect_uri": "https://example.com/callback"
  };
  const options = {
    "payload": payload,
    "headers": headers,
  };

  const response = UrlFetchApp.fetch("https://accounts.spotify.com/api/token", options);
  const parsedResponse = JSON.parse(response);
  p.setProperties({
    "accessToken": parsedResponse.access_token,
    "refreshToken": parsedResponse.refresh_token
  });
  return parsedResponse.access_token;
}

function refreshAccessToken() {
  const p = PropertiesService.getScriptProperties();
  const clientID = p.getProperty("clientID");
  const clientSecret = p.getProperty("clientSecret");

  const headers = {
    "Authorization": "Basic " + Utilities.base64Encode(clientID + ":" + clientSecret),
    "Content-Type": "application/x-www-form-urlencoded"
  };
  const payload = {
    "grant_type": "refresh_token",
    "refresh_token": p.getProperty("refreshToken")
  };
  const options = {
    "payload": payload,
    "headers": headers,
  };

  const response = UrlFetchApp.fetch("https://accounts.spotify.com/api/token", options);
  const parsedResponse = JSON.parse(response);

  if (parsedResponse.access_token) {
    p.setProperty("accessToken", parsedResponse.access_token);
  }
  if (parsedResponse.refresh_token) {
    p.setProperty("refreshToken", parsedResponse.refresh_token);
  }
  return parsedResponse.access_token;
}

function postMessage(text) {
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify({ "text": text, "mrkdwn": true }),
  };
  UrlFetchApp.fetch(PropertiesService.getScriptProperties().getProperty("incomingWebhook"), options);
}
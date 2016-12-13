
var app = {
    // Application Constructor
    initialize: function() {
        this.bindEvents();
    },
    // Bind Event Listeners
    //
    // Bind any events that are required on startup. Common events are:
    // 'load', 'deviceready', 'offline', and 'online'.
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
    },
    // deviceready Event Handler
    //
    // The scope of 'this' is the event. In order to call the 'receivedEvent'
    // function, we must explicitly call 'app.receivedEvent(...);'
    onDeviceReady: function() {
        app.receivedEvent('deviceready');
		loadAppSettings();
		//populateLocalSongs(); // For now im disabling local downloading and any related functionality
    },
    // Update DOM on a Received Event
    receivedEvent: function(id) {
        console.log('Received Event: ' + id);
    }
};

var backend_url = "";

var loadedPlaylist = Array();
var player_playing = false;
var currentSong = -1;
var currentSongID = 0;
var currentSongData;
var controlsVisible = false;

// Search variables
var searchBySel = "artist";
var searchIsTyping = false;
var searchIsSearchRequestProcessing = false;
var searchLastKeyPress = 0;
var searchWaitTime = 1000; // ms

// Library variables
var songDownloads = Array();
var savedDownloadsJsonLoaded = false;
var savedDownloadsJson;

$(document).ready(function() {
	
	// Lets initialize the jPlayer instance so we can start playing some tunes
	$("#jPlayer_instance").jPlayer({
		ready: function (event) {
			//$(this).jPlayer("setMedia", {
			//	mp3: ""
			//});
		},
		supplied: "mp3, m4a",
		wmode: "window",
		useStateClassSkin: true,
		autoBlur: false,
		smoothPlayBar: true,
		keyEnabled: true,
		remainingDuration: true,
		toggleDuration: true
	});
	
	
	// Setup dimentions for the album art
	var cw = screen.width;
	$('#songArt').css({'height':cw+'px'});
	
	// Create our event callbacks for the jPlayer
	//-----------------
	// When a new song is loaded in, reset the download progress bar
	$("#jPlayer_instance").bind($.jPlayer.event.loadstart, function(event) {
		$("#downloadProgress").css("width", "0%");
	});
	// Update the download progress bar
	$("#jPlayer_instance").bind($.jPlayer.event.progress, function(event) {
		$("#downloadProgress").css("width", event.jPlayer.status.seekPercent+"%");
	});
	// Update our play timer as well as the play progress bar
	$("#jPlayer_instance").bind($.jPlayer.event.timeupdate, function(event) {
		$("#songProgress").css("width", event.jPlayer.status.currentPercentAbsolute+"%");
		var minutes = Math.floor(event.jPlayer.status.currentTime % 3600 / 60);
		var seconds = Math.floor(event.jPlayer.status.currentTime % 3600 % 60);
		if(seconds < 10)
			seconds = "0"+seconds;
		$("#timeLeft").text(minutes+":"+seconds);
	});
	// Create an event for when a song ends. Simply just play the next song from the pre-loaded main playlist
	$("#jPlayer_instance").bind($.jPlayer.event.ended, function(event) {
		$("#songProgress").css("width", "0%");
		playerNext();
	});
	// Update our total song time when a song is fully loaded
	$("#jPlayer_instance").bind($.jPlayer.event.loadeddata, function(event) {
		var minutes = Math.floor(event.jPlayer.status.duration % 3600 / 60);
		var seconds = Math.floor(event.jPlayer.status.duration % 3600 % 60);
		if(seconds < 10)
			seconds = "0"+seconds;
		$("#timeRight").text(minutes+":"+seconds);
	});
	
	// Search input bar functions/events
	//-------------
	// Flag that were currently typing
	$("#searchBarInput").keydown(function(e) {
		searchIsTyping = true;
	});
	// Weve finished typing so schedule a timer to attempt to search if we havent typed again by the time it is finished
	$("#searchBarInput").keyup(function(e) {
		searchLastKeyPress = new Date().getTime();
		searchIsTyping = false;
		setTimeout(function() { doSearch(); }, searchWaitTime);
	});
	// Toggle for searching by artist, it just clears the list and changes th searchBySel variable which is sent to the backend
	$("#searchByArtistButton").click(function(e) {
		$("#searchBySongButton").removeClass("searchBySel");
		$("#searchByArtistButton").addClass("searchBySel");
		$("#searchContainer").empty();
		searchBySel = "artist";
		$("#searchBarInput").attr("placeholder", "Search By Artist...");
	});
	// Same functionality as above listener, only for searching by song
	$("#searchBySongButton").click(function(e) {
		$("#searchByArtistButton").removeClass("searchBySel");
		$("#searchBySongButton").addClass("searchBySel");
		$("#searchContainer").empty();
		searchBySel = "song";
		$("#searchBarInput").attr("placeholder", "Search By Song Title...");
	});
	// Experimental code for scrolling through the main page playlist. May implement later for data saving features
	//$("#playlistContainer").scroll(function() {
	//   if($("#playlistContainer").scrollTop() + $("#playlistContainer").height() > $("#playlistContainer").prop('scrollHeight') - 100) {
	//	   loadMorePlaylistSongs();
	//   }
	//});
});

// Called from $("#searchBarInput").keyup listener on a time delay
function doSearch() {
	// If were typing still or an ajax request is out...dont continue
	if(searchIsTyping || searchIsSearchRequestProcessing)
		return;
	
	// If its been less than the wait time for searching...dont continue and recall the function
	if((new Date().getTime() - searchLastKeyPress) < searchWaitTime) {
		setTimeout(function() {doSearch();}, 100);
		return;
	}
	
	// If the input is empty...dont continue
	if($("#searchBarInput").val() == "") {
		$("#searchContainer").empty();
		return;
	}
	
	$("#searchContainer").empty(); // Empty out the search results
	searchIsSearchRequestProcessing = true; // Set flag so we cant do multiple ajax queries at once
	$.ajax({
		type: "POST",
		url: backend_url+"/index.php",
		data: 'cmd=search&search='+$("#searchBarInput").val()+'&by='+searchBySel,
		cache: false,
		success: function(result) {
			searchIsSearchRequestProcessing = false;
			var jsonResponse = jQuery.parseJSON(result);
			if(jsonResponse.status === "success")
			{
				if(jsonResponse.songs != null) {
					// Go through each returned song from the server returned search results
					for(var i=0; i<jsonResponse.songs.length; i++) {
						var song = jsonResponse.songs[i];
						// Create a new row in the search container div
						if(song.artwork == "")
							song.artwork = "img/missingsongart.jpg";
						var escapedTitle = song.title.replace(/'/g, "\\'");
						var newRow = '<div class="playlistRow" onClick="sendExternalDownloadSong(\''+escapedTitle+'\',\''+song.artist+'\',\''+song.artwork+'\',\''+song+'\');">'+song.title;
						if(song.album != "")
							var newRow = newRow + ' - '+song.album;
						var newRow = newRow + '<br>'+song.artist+'<div class="songPlaylistArt" style="background-image:url('+song.artwork+');"></div></div>';
						$("#searchContainer").append(newRow); // Add the row
					}
				}
			}
		},
		error: function(error) {
			searchIsSearchRequestProcessing = false;
		}
	});
}

// Page changing functions & player control toggling
//------------------
// Open the main page
function showMainPage() {
	$.mobile.changePage( "#mainPage", { transition: "slideup" });
	hidePlayerControls();
}
// Open the music player
function showPlayer() {
	$.mobile.changePage( "#playerPage", { transition: "slideup" });
	showPlayerControls();
}
// Open the search page
function showSearch() {
	$.mobile.changePage( "#searchPage", { transition: "slide" });
}
// Open the playlists page
function showPlaylists() {
	$.mobile.changePage( "#playlistPage", { transition: "slide" });
}
// Open the music library page
function showLibrary() {
	$("#libraryContainer").empty(); // Empty out the list
	$.mobile.changePage( "#libraryPage", { transition: "slide" });
	
	// Show all downloads up top on the list
	for(var i=0; i<songDownloads.length; i++) {
		if(songDownloads[i].status != 1)
			$("#libraryContainer").append('<div class="playlistRow" id="libraryDownload'+i+'" onClick="">'+songDownloads[i].title+'<br>'+songDownloads[i].artist+'<div class="songPlaylistArt" style="background-image:url('+songDownloads[i].artwork+');"></div></div>');
	}
	
	// Then display all locally downloaded songs
	if(savedDownloadsJson !== undefined) {
		if(savedDownloadsJson.length > 0) {
			for(var i=0; i<savedDownloadsJson.length; i++) {
				$("#libraryContainer").append('<div class="playlistRow" id="librarySaved'+i+'" onClick="playerPlayLocalSong('+i+');">'+savedDownloadsJson[i].title+'<br>'+savedDownloadsJson[i].artist+'<div class="songPlaylistArt" style="background-image:url('+savedDownloadsJson[i].artwork+');"></div></div>');
			}
		}
	}
}
// Show the player controls
function showPlayerControls() {
	if(!controlsVisible) {
		$(".playerArea").show(200, "swing");
		controlsVisible = true;
	}
}
// Hide the player controls
function hidePlayerControls() {
	if(controlsVisible) {
		$(".playerArea").hide(200, "swing");
		controlsVisible = false;
	}
}
// Connect to the backend and get an initial song playlist based on whats in the database
function connectToBackend() {
	// As soon as were ready lets connect to our backend and get some songs for the main page
	console.log("Connecting to backend...");
	$.ajax({
		type: "POST",
		url: backend_url+"/index.php",
		data: 'cmd=connect',
		cache: false,
		dataType: 'json',
		success: function(result){
			if(result.status === "success")
			{
				console.log("Connected to backend!");
				for(var i=0; i<result.songs.length; i++) {
					loadedPlaylist[i] = result.songs[i];
					var song = result.songs[i];
					if(song.artwork == "")
						song.artwork = "img/missingsongart.jpg";
					var newRow = '<div class="playlistRow" id="playlistSongsRow'+i+'" onClick="playerPlayPlaylistSong('+i+')">'+song.title + '<br>'+song.artist+'<div class="songPlaylistArt" style="background-image:url(\''+song.artwork+'\');"></div></div>';
					$("#playlistContainer").append(newRow);
				}
			}
		}
	});
}
// Load the app settings (backend url)
function loadAppSettings() {
	window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, function (fs) {
		console.log('loadAppSettings() successfully accessed filesystem: ' + fs.name);
		
		readAppSettings('appSettings.json', fs);
	},
	function(fileSystemError) {
		alert(fileSystemError);
	});
}
// Read the app settings file
function readAppSettings(fileName, fs) {
	fs.root.getFile(fileName, { create: false, exclusive: false }, function (fileEntry) {

		console.log("readFile() does file exist? " + fileEntry.isFile.toString());
		fileEntry.file(function (file) {
			var reader = new FileReader();
			reader.onloadend = function() {
				console.log("readFile() Successful file read: " + this.result);
				var jsonSettings = jQuery.parseJSON(this.result);
				backend_url = jsonSettings.backendURL;
				console.log("backend url is "+backend_url);
				connectToBackend();
			};
			reader.readAsText(file);
		},
		function(e) {
			console.log(e);
			alert(e);
		});

	},
	function(e) {
		$.mobile.changePage("#settingsPage");
		console.log("No appSettings.json file!");
	});
}
// Save the app settings
function saveAppSettings() {
	window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, function (fs) {
		console.log('loadAppSettings() successfully accessed filesystem: ' + fs.name);
		
		var testBackend = $("#backendURLInput").val();
		$.ajax({
			type: "POST",
			url: testBackend+"/index.php",
			data: 'cmd=testConnect',
			cache: false,
			dataType: 'json',
			success: function(result){
				if(result.status === "success")
				{
					backend_url = testBackend;
					fs.root.getFile("appSettings.json", { create: true, exclusive: false }, function (fileEntry) {
						writeFile(fileEntry, new Blob(['{"backendURL":"'+$("#backendURLInput").val()+'"}'], { type: 'text/plain' }));
					},
					function(e) {
						alert(e);
					});
					navigator.notification.alert(
						"Successfully connected to the backend. Beat-Stream is now ready to use!", // message
						function() { connectToBackend(); $.mobile.changePage("#mainPage"); }, // callback
						'Error', // title
						'Close' // buttonName
					);
				}
				else {
					navigator.notification.alert(
						"Connecting to the backend failed! Check your URL and try again.", // message
						'', // callback
						'Error', // title
						'Close' // buttonName
					);
				}
			},
			error: function(e) {
				navigator.notification.alert(
					"Connecting to the backend failed! Check your URL and try again.", // message
					'', // callback
					'Error', // title
					'Close' // buttonName
				);
			}
		});
	},
	function(fileSystemError) {
		alert(fileSystemError);
	});
}

// Library local songs loading functions
//-------------------
// Access the local filesystem and find the downloadedSongs.json to initiate loading of all locally saves songs
function populateLocalSongs() {
	$("#libraryContainer").append('<div class="playlistRow" id="" onClick="">Loading local songs...</div>');
	window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, function (fs) {
		console.log('populateLocalSongs() successfully accessed filesystem: ' + fs.name);
		//alert('populateLocalSongs() successfully accessed filesystem: ' + fs.name);
		
		// Get all local files for this app
		var reader = fs.root.createReader();
		reader.readEntries(
			function (entries) {
				if(entries.length > 0) {
					// Go through all found files to search for the downloadedSongs.json file to load in all the songs on the device
					for(var i=0; i<entries.length; i++) {
						if(entries[i].name == "downloadedSongs.json") {
							console.log("populateLocalSongs() found downloadedSongs.json");
							readDownloadsFile(fs);
							break;
						}
					}
				}
				else { // The downloadedSongs.json wasnt found so lets create it!
					console.log("No downloadedSongs.json file! Creating one...");
					fs.root.getFile("downloadedSongs.json", { create: true, exclusive: false }, function (fileEntry) {
						writeFile(fileEntry, new Blob([""], { type: 'text/plain' }));
					},
					function(e) {
						alert(e);
					});
				}
			},
			function (err) {
				alert(fileSystemError);
			}
		);
	},
	function(fileSystemError) {
		alert(fileSystemError);
	});
}
// Read the found downloadedSongs.json file and if its not empty, add the local songs to the libraby list container div
function readDownloadsFile(fs) {
	fs.root.getFile('downloadedSongs.json', { create: false, exclusive: false }, function (fileEntry) {
		fileEntry.file(function (file) {
			var reader = new FileReader();
			reader.onloadend = function() {
				console.log("Successfully read downloadedSongs.json file: "+this.result);
				//alert("Successfully read downloadedSongs.json file: "+this.result);
				if(this.result != "")
					savedDownloadsJson = jQuery.parseJSON(this.result);
				else
					savedDownloadsJson = [];
				savedDownloadsJsonLoaded = true;
				if(savedDownloadsJson.length > 0) {
					//for(var s=0; s<savedDownloadsJson.length; s++) {
					//	$("#libraryContainer").append('<div class="playlistRow" id="" onClick="">'+savedDownloadsJson[s].title+'</div>');
					//}
				}
				else {
					console.log("No locally saved songs!");
					//alert("No locally saved songs!");
					$("#libraryContainer").append('<div class="playlistRow" id="" onClick="">No local songs saved!</div>');
				}
			};
			reader.readAsText(file);
		},
		function(e) {
			savedDownloadsJsonLoaded = false;
			console.log("Failed to load downloadedSongs.json: "+e);
			alert("Failed to load downloadedSongs.json: "+e);
		});

	},
	function(e) {
		alert(e);
	});
}

// Filesystem helper functions
//-----------------
// Write a file to the device
function writeFile(fileEntry, dataObj) {
    // Create a FileWriter object for our FileEntry (log.txt).
    fileEntry.createWriter(function (fileWriter) {

        fileWriter.onwriteend = function() {
            console.log("Successful file write..."+fileEntry.name);
			//alert("Successful file write..."+fileEntry.name);
			return true;
        };

        fileWriter.onerror = function(e) {
            console.log("Failed file write: " + e.toString());
			//alert("Failed file write: " + e.toString());
			return false;
        };

        // If data object is not passed in, dont continue
        if (!dataObj) {
			console.log("writeFile() failed, no dataObj passed");
            return false;
        }

        fileWriter.write(dataObj);
    });
}
// Read a file on the filesystem and return its contents
function readFile(fileName, fs) {
	
	fs.root.getFile(fileName, { create: false, exclusive: false }, function (fileEntry) {

		console.log("readFile() does file exist? " + fileEntry.isFile.toString());
		fileEntry.file(function (file) {
			var reader = new FileReader();
			reader.onloadend = function() {
				console.log("readFile() Successful file read: " + this.result);
				alert("readFile() Successful file read: " + this.result);
				return this.result;
			};
			reader.readAsText(file);
		},
		function(e) {
			console.log(e);
			alert(e);
		});

	},
	function(e) {
		alert("File system error: "+e);
	});
}

// External library song downloading functions
//--------------------
// Send a request to the backend to find a source for a searched song
function sendExternalDownloadSong(title, artist, artwork, song) {
	$("#jPlayer_instance").jPlayer( "clearMedia" ); // Stop current song and clear the track
	$("#songArt").css("background-image", "url("+artwork+")"); // Set the album art to the source from the selected search
	$("#songTitle").html(title+"<br><span class='songTitleArtist'>"+artist+"</span>"); // Set the new song title
	$("#downloadProgress").css("width", "0%"); // Reset download progress to 0%
	$("#songProgress").css("width", "0%"); // Reset song progress
	$("#timeLeft").text("0:00");
	$("#timeRight").text("0:00");
	$("#songLoader").show(); // Show the loading spinner
	showPlayer(); // Open the player page
	
	// Now send out the request for the backend to find the song and download it to the server
	$.ajax({
		type: "POST",
		url: backend_url+"/index.php",
		data: encodeURI('cmd=download'+"&song="+title+"&artist="+artist),
		cache: false,
		success: function(result){
			var jsonResponse = jQuery.parseJSON(result);
			if(jsonResponse.status === "success") {
				loadedPlaylist[loadedPlaylist.length] = {song:jsonResponse.song.song, title:title, artist:artist, artwork:artwork, id:jsonResponse.song.id}; // Add the song to the main page playlist array
				currentSong = loadedPlaylist.length; // Set the id to the end position of the above array
				currentSongID = jsonResponse.song.id; // The actual database ID of the song
				currentSongData = loadedPlaylist[loadedPlaylist.length-1]; // Set the song data variable for easy reference in other functions
				player_playing = true;
				$("#playerPlayPause").removeClass("play");
				$("#playerPlayPause").addClass("pause");
				// Create a new row in the main page playlist for this new song
				if(artwork == "")
						artwork = "img/missingsongart.jpg";
				var newRow = '<div class="playlistRow" id="playlistSongsRow'+loadedPlaylist.length+'" onClick="playerPlayPlaylistSong('+loadedPlaylist.length+')">'+title+'<br>'+artist+'<div class="songPlaylistArt" style="background-image:url('+artwork+');"></div></div>';
				$("#playlistContainer").append(newRow);
				
				playTrack(jsonResponse.song.song); // Play the track
				$("#songLoader").hide(); // Hide the loading spinner
			}
			else if(jsonResponse.status === "downloaded") { // This returns when the searched song is already in the database
				$("#songLoader").hide();
				if(jsonResponse.song.artwork == "")
						jsonResponse.song.artwork = "img/missingsongart.jpg";
				$("#songArt").css("background-image", "url("+jsonResponse.song.artwork+")"); // Set the album art
				$("#songTitle").html(jsonResponse.song.title+"<br><span class='songTitleArtist'>"+jsonResponse.song.artist+"</span>"); // Set the song title
				player_playing = true;
				currentSong = -1; // Set the current playlist array id reference to -1 because we dont know if this song is in that list...this needs to be improved AB:NEEDS-IMPROVEMENT
				currentSongID = jsonResponse.song.id; // The actual database ID of the song
				currentSongData = jsonResponse.song; // Set the song data variable for easy reference in other functions
				playTrack(jsonResponse.song.song); // Play the track
				$("#playerPlayPause").removeClass("play");
				$("#playerPlayPause").addClass("pause");
			}
			else {
				// An error was returned, likely a good source wasnt found or some other error from the backend
				$("#songLoader").hide();
				navigator.notification.alert(
					jsonResponse.reason, // message
					'', // callback
					'Error', // title
					'Close' // buttonName
				);
			}
		}
	});
}
// Send a request to the backend to re-source an external library song
function sendResourceSong() {
	$("#playerPagePopup").popup( "close" ); // Close the player page menu dropdown
	if(currentSongID == 0) // We need to know the daatbase ID for the song in order to re-source it..cant continue
		return;
	
	// Reset all player variables, bars and numbers
	$("#jPlayer_instance").jPlayer( "clearMedia" );
	$("#downloadProgress").css("width", "0%");
	$("#songProgress").css("width", "0%");
	$("#timeLeft").text("0:00");
	$("#timeRight").text("0:00");
	$("#songLoader").show();
	player_playing = false;
	
	// Send the request to re-source the song
	$.ajax({
		type: "POST",
		url: backend_url+"/index.php",
		data: encodeURI('cmd=resource'+"&id="+currentSongID),
		cache: false,
		success: function(result){
			var jsonResponse = jQuery.parseJSON(result);
			if(jsonResponse.status === "success") {
				// The song was successfully re-sourced! Since its technically the same some we were already playing, we dont need to change titles, data references or ID's
				player_playing = true;
				$("#playerPlayPause").removeClass("play");
				$("#playerPlayPause").addClass("pause");
				playTrack(jsonResponse.song.song); // Play the track
				$("#songLoader").hide();
			}
			else {
				// The re-source failed due to no additional sources or some other backend error
				$("#songLoader").hide();
				navigator.notification.alert(
					jsonResponse.reason, // message
					'', // callback
					'Error', // title
					'Close' // buttonName
				);
			}
		}
	});
}

// External library song management functions
//---------------
// Send a delete request to remove the external library song, database entry and album art from the server
function sendDeleteSong() {
	$("#playerPagePopup").popup( "close" );
	if(currentSongID == 0) // We need the database ID to do this so cant continue...
		return;
	
	$("#jPlayer_instance").jPlayer( "clearMedia" ); // Stop playing the song 
	$("#songPlaylistPlaying").remove(); // Remove the currently playing instance from the main page playlist (if it exists)
	$("#playerPlayPause").removeClass("pause");
	$("#playerPlayPause").addClass("play");
	$("#songArt").css("background-image", "url('')");
	$("#songTitle").html("");
	player_playing = false;
	$("#downloadProgress").css("width", "0%");
	$("#songProgress").css("width", "0%");
	$("#timeLeft").text("0:00");
	$("#timeRight").text("0:00");
	$("#songLoader").show();
	currentSongData = null; // Clear our reference variable
	
	// Send the delete request
	var dataString = 'cmd=delete';
	$.ajax({
		type: "POST",
		url: backend_url+"/index.php",
		data: encodeURI('cmd=delete'+"&id="+currentSongID),
		cache: false,
		success: function(result){
			var jsonResponse = jQuery.parseJSON(result);
			if(jsonResponse.status === "success") {
				// Check to see if the currentSong array id matches, if it does remove the row from the main page playlist
				if(loadedPlaylist[currentSong].id == currentSongID) {
					$("#playlistSongsRow"+currentSong).remove();
				}
				currentSong = 0; // Reset the next 2 variables now that weve made the check above
				currentSongID = 0;
				$("#songLoader").hide();
				showMainPage(); // Open the main page back up
			}
			else {
				// This should rarely happen but just in case the backend has an issue
				$("#songLoader").hide();
				navigator.notification.alert(
					jsonResponse.reason, // message
					'', // callback
					'Error', // title
					'Close' // buttonName
				);
			}
		}
	});
}
// Send the backend new data for a song in our external library
function editSong() {
	$.mobile.changePage( "#editSongPage", { transition: "slideup" });
	$("#playerPagePopup").popup( "close" ); // This needs to be after the changePage call as the page wont open if its called first
	if(currentSongID == 0) // Again since we are dealing with the database, we need this ID to continue
		return;
	
	hidePlayerControls(); // Just hide the player controls
	// Set the inputs with the current songs data
	$("#editInputTitle").val(currentSongData.title);
	$("#editInputArtist").val(currentSongData.artist);
	$("#editInputAlbum").val(currentSongData.album);
	$("#editInputGenre").val(currentSongData.genre);
}
// Send the backend the new song information
function sendEditSong() {
	if(currentSongID == 0) // Again since we are dealing with the database, we need this ID to continue
		return;
	
	// Send the backend the edit request
	$.ajax({
		type: "POST",
		url: backend_url+"/index.php",
		data: encodeURI("cmd=editSong&id="+currentSongID+"&title="+$("#editInputTitle").val()+"&artist="+$("#editInputArtist").val()+"&album="+$("#editInputAlbum").val()+"&genre="+$("#editInputGenre").val()),
		cache: false,
		success: function(result){
			var jsonResponse = jQuery.parseJSON(result);
			if(jsonResponse.status === "success") {
				// Update the local variabled with the new info
				$("#songTitle").html($("#editInputTitle").val()+"<br><span class='songTitleArtist'>"+$("#editInputArtist").val()+"</span>");
				currentSongData.title = $("#editInputTitle").val();
				currentSongData.artist = $("#editInputArtist").val();
				currentSongData.album = $("#editInputAlbum").val();
				currentSongData.genre = $("#editInputGenre").val();
				// If this song is in the main page playlist, edit the row with the new data
				if(currentSong != -1) {
					$("#playlistSongsRow"+currentSong).html('<div id="songPlaylistPlaying"></div>'+currentSongData.title+'<br>'+currentSongData.artist+'<div class="songPlaylistArt" style="background-image:url(\''+currentSongData.artwork+'\');"></div>');
				}
				showPlayer(); // Were done here, show the player and controls again
			}
			else {
				// just in case the backend has some time of issue
				$("#songLoader").hide();
				navigator.notification.alert(
					jsonResponse.reason, // message
					'', // callback
					'Error', // title
					'Close' // buttonName
				);
			}
		}
	});
}

// Local library downloading functions
//-------------
// Initialze a local file download for a song
function localDownloadSong() {
	// We need to know the external URL for the song in order to download it
	if(currentSongData.song == "") {
		$("#playerPagePopup").popup( "close" );
		return;
	}
	
	var songString = currentSongData.song.split("/"); // Split the string so that we can get just the file name
	window.requestFileSystem(LocalFileSystem.PERSISTENT, 25 * 1024 * 1024, function (fs) {
		console.log('localDownloadSong() opened filesystem: ' + fs.name);
		alert('localDownloadSong() opened filesystem: ' + fs.name);
		// Parameters passed to getFile create a new file or return the file if it already exists.
		fs.root.getFile(songString[1], { create: true, exclusive: false }, function (fileEntry) {
			// AB: NEEDS-IMPROVEMENT should probably skip downloading if the file already exists
			doSongLocalDownload(fileEntry, fs); // Call the actual download function
		},
		function(createFileError) {
			alert(createFileError);
		});
	
	},
	function(fileSystemError) {
		alert(fileSystemError);
	});
}
// This actually does the file transfer from the server to the device
function doSongLocalDownload(fileEntry, fs) {
	var fileTransfer = new FileTransfer();
	var uri = encodeURI(backend_url+"/downloadSong.php?song="+currentSongData.song);
	var songString = currentSongData.song.split("/");
	var fileURL = fileEntry.toURL();
	// Add this new download to the downloads array for use on the library page
	var downloadID = 0;
	if(songDownloads.length > 0)
		downloadID = songDownloads.length;
	else
		downloadID = 0;
	songDownloads[downloadID] = {title:currentSongData.title, artist:currentSongData.artist, artwork:currentSongData.artwork, status:0};
	// Create a listener for updating a downloads progress
	fileTransfer.onprogress = function(progressEvent) {
		if (progressEvent.lengthComputable) {
			console.log("Download "+downloadID+" progress: "+(progressEvent.loaded / progressEvent.total)+"%");
			// Update the downloads array as well as the download row on the library page
			songDownloads[downloadID].status = (progressEvent.loaded / progressEvent.total);
			$("#libraryDownload"+downloadID).html(currentSongData.title+' - '+currentSongData.artist+' ('+Math.floor(songDownloads[downloadID].status * 100)+'%)'+'<div class="songPlaylistArt" style="background-image:url(\''+currentSongData.artwork+'\');"></div>');
		}
		else {
			// The progress couldnt be figured out
		}
	};
	// Open the library page and create the new download row
	showLibrary();
	$("#playerPagePopup").popup("close");
	$("#libraryContainer").append('<div class="playlistRow" id="libraryDownload'+downloadID+'">'+currentSongData.title+' - '+currentSongData.artist+' ('+Math.floor(songDownloads[downloadID].status * 100)+'%)<div class="songPlaylistArt" style="background-image:url(\''+currentSongData.artwork+'\');"></div></div>');
	// Start the download
	fileTransfer.download(
		uri, // External song file
		fileURL, // Local file to be saved
		function(entry) { // Download success
			console.log("doSongLocalDownload() download complete: " + entry.toURL());
			
			// Add the newly downloaded song to the saved downloads json array and overwrite the file
			if(savedDownloadsJson !== undefined)
				savedDownloadsJson.push({"title":currentSongData.title,"artist":currentSongData.artist,"album":currentSongData.album,"song":entry.toURL(),"id":currentSongData.id,"artwork":currentSongData.artwork});
			else
				savedDownloadsJson = [{"title":currentSongData.title,"artist":currentSongData.artist,"album":currentSongData.album,"song":entry.toURL(),"id":currentSongData.id,"artwork":currentSongData.artwork}];
			var newFile = JSON.stringify(savedDownloadsJson);
			console.log("doSongLocalDownload() attempting to save new json: " + newFile);
			fs.root.getFile("downloadedSongs.json", { create: true, exclusive: false }, function (jsonFileEntry) {
				writeFile(jsonFileEntry, new Blob([newFile], { type: 'text/plain' }));
			},
			function(createFileError) {
				alert(createFileError);
			});
		},
		function(error) {
			console.log("doSongLocalDownload() download error source " + error.source);
			console.log("doSongLocalDownload() download error target " + error.target);
			alert("doSongLocalDownload() download error target " + error.target+ " & code: "+error.code);
			console.log("doSongLocalDownload() download error code" + error.code);
		},
		true,
		{
			headers: {
			}
		}
	);
}

// Player helper functions
//-----------------
// This function is used throughout the app to actually load the song url (local or external) and then play the file
function playTrack(track) {
	// Get the file extention and set the current media
	var trInfo = track.split(".");
	var ext = trInfo[(trInfo.length - 1)];
	if(track.indexOf("file:") === -1) {
		if(ext == "mp3")
			$("#jPlayer_instance").jPlayer( "setMedia", {mp3: backend_url+"/"+track} );
		else if(ext == "m4a")
			$("#jPlayer_instance").jPlayer( "setMedia", {m4a: backend_url+"/"+track} );
	}
	else {
		window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, function (fs) {
			console.log('playTrack() successfully accessed filesystem: ' + fs.name);
			trackFile = track.replace("file:///persistent/", "");
			fs.root.getFile(trackFile, { create: false, exclusive: false }, function (fileEntry) {
				if(ext == "mp3")
					$("#jPlayer_instance").jPlayer( "setMedia", {mp3: fileEntry.fullPath} );
				else if(ext == "m4a")
					$("#jPlayer_instance").jPlayer( "setMedia", {m4a: fileEntry.fullPath} );
			},
			function(createFileError) {
				console.log(createFileError);
			});
		},
		function(fileSystemError) {
			console.log(fileSystemError);
		});
	}
	
	// Remove old play indicator from the main page playlist (if it exists)
	$("#songPlaylistPlaying").remove();
	// Add the play indicator to the currect main page playlist row
	var newHtml = '<div id="songPlaylistPlaying"></div>'+$("#playlistSongsRow"+currentSong).html();	
	$("#playlistSongsRow"+currentSong).html(newHtml);
	// If the user hasnt paused playing, play the track
	if(player_playing || !controlsVisible) {
		$("#jPlayer_instance").jPlayer( "play" );
		player_playing = true;
	}
}
// This is the function behind the play/pause button functionality
function playerTogglePlay() {
	if(player_playing) { // If were playing, pause the song
		$("#jPlayer_instance").jPlayer( "pause" );
		$("#playerPlayPause").removeClass("pause");
		$("#playerPlayPause").addClass("play");
		player_playing = false;
	}
	else { // Currently paused, play the song
		player_playing = true;
		if(currentSong == -1) // If we push play with no selected track, play the first song in the main page playlist
			playerPlayPlaylistSong(0);
		else
			$("#jPlayer_instance").jPlayer( "play" );
		
		$("#playerPlayPause").removeClass("play");
		$("#playerPlayPause").addClass("pause");
	}
}
// This is called when the user selects a main page playlist song (song param is the loadedPlaylist var array ID)
function playerPlayPlaylistSong(song) {
	// If we push the same song thats already playing, just open the player
	if(song == currentSong) {
		showPlayer();
		return;
	}
	// Setup all variables and play the track
	$("#jPlayer_instance").jPlayer( "clearMedia" );
	$("#songArt").css("background-image", "url('"+loadedPlaylist[song].artwork+"')");
	$("#songTitle").html(loadedPlaylist[song].title+"<br><span class='songTitleArtist'>"+loadedPlaylist[song].artist+"</span>");
	currentSong = song;
	currentSongID = loadedPlaylist[song].id;
	currentSongData = loadedPlaylist[song];
	playTrack(loadedPlaylist[song].song);
	$("#songLoader").hide();
	$("#playerPlayPause").removeClass("play");
	$("#playerPlayPause").addClass("pause");
	showPlayer();
}
// This is called when the user selects a main page playlist song (song param is the savedDownloadsJson var array ID)
function playerPlayLocalSong(song) {
	// If we push the same song thats already playing, just open the player
	//if(song == currentSong) {
	//	showPlayer();
	//	return;
	//}
	// Setup all variables and play the track
	$("#jPlayer_instance").jPlayer( "clearMedia" );
	$("#songArt").css("background-image", "url('"+savedDownloadsJson[song].artwork+"')");
	$("#songTitle").html(loadedPlaylist[song].title+"<br><span class='songTitleArtist'>"+savedDownloadsJson[song].artist+"</span>");
	currentSong = -1;
	currentSongID = savedDownloadsJson[song].id;
	currentSongData = savedDownloadsJson[song];
	playTrack(savedDownloadsJson[song].song);
	$("#songLoader").hide();
	$("#playerPlayPause").removeClass("play");
	$("#playerPlayPause").addClass("pause");
	showPlayer();
}
// This is called when the next song button is pushed
function playerNext() {
	// Some logic to not allow the user to go beyond the loadedPlaylist array length
	if((currentSong+1) <= (loadedPlaylist.length-1))
		currentSong++;
	else
		currentSong = 0;
	// Set the variables and play the track
	currentSongID = loadedPlaylist[currentSong].id;
	currentSongData = loadedPlaylist[currentSong];
	$("#jPlayer_instance").jPlayer( "clearMedia" );
	$("#songArt").css("background-image", "url('"+loadedPlaylist[currentSong].artwork+"')");
	$("#songTitle").html(loadedPlaylist[currentSong].title+"<br><span class='songTitleArtist'>"+loadedPlaylist[currentSong].artist+"</span>");
	playTrack(loadedPlaylist[currentSong].song);
	$("#songLoader").hide();
}
// This is called when the previous song button is pushed
function playerPrev() {
	// Some logic to not allow going below 0 in the loadedPlaylist array
	if((currentSong-1) > -1)
		currentSong--;
	else
		currentSong = (loadedPlaylist.length-1);
	// Set the variables and play the track
	currentSongID = loadedPlaylist[currentSong].id;
	currentSongData = loadedPlaylist[currentSong];
	$("#jPlayer_instance").jPlayer( "clearMedia" );
	$("#songArt").css("background-image", "url('"+loadedPlaylist[currentSong].artwork+"')");
	$("#songTitle").html(loadedPlaylist[currentSong].title+"<br>"+loadedPlaylist[currentSong].artist);
	playTrack(loadedPlaylist[currentSong].song);
	$("#songLoader").hide();
}
//import * as tf from '@tensorflow/tfjs';

var gameField = new Array();
var discs;
var board = document.getElementById("game-table");
var currentPlayer;
var id = 1;
var models = new Array();
var predReady = new Array();
var priors;

// Whether computer plays red/yellow.
var compPlays = [false, false];

function newGame(loadFromUrl) {
  board.innerHTML = "";
  discs = new Array();
  predReady = [false, false];
  prepareField();
  currentPlayer = 1;
  if (loadFromUrl == true) {
    loadFromQueryString();
  }
  addNewDisc(0);
  updatePredictions();
}

function loadModels() {
  loadNewModel(1);
  loadNewModel(2);
}

function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

// Turns a query param like "3,4;1,2" into an array like [[3, 4], [1, 2]]
function posStrToArray(posStr) {
  rowColStrs = posStr.split(';')
  rowCols = [];
 
  rowColStrs.forEach(function(s) {
    rc = s.split(',');
    rowCols.push([parseInt(rc[0]), parseInt(rc[1])]);
  });
  
  return rowCols;
}

function loadFromQueryString() {
  var discStr = getParameterByName('discs');
  if (discStr) {
	var pos = posStrToArray(discStr);
	for (i = 0; i < pos.length; i++) {
	  disc = addNewDisc(0);
	  placeDisc(disc, pos[i][0], pos[i][1]);
	  changePlayer();
	}
  }

  var model1Str = getParameterByName('model1');
  if (model1Str) {
	$("#ModelSelect1").val(model1Str)
  }

  var model2Str = getParameterByName('model2');
  if (model2Str) {
	$("#ModelSelect2").val(model2Str)
  }

  var skill1Str = getParameterByName('skill1');
  if (skill1Str) {
	$("#Skill1").val(skill1Str)
  }

  var skill2Str = getParameterByName('skill2');
  if (skill2Str) {
	$("#Skill2").val(skill2Str)
  }

  var autoplay1Str = getParameterByName('autoplay1');
  if (autoplay1Str) {
	$("#AutoPlay1").prop("checked", autoplay1Str == "true");
    compPlays[0] = autoplay1Str=="true";
  }

  var autoplay2Str = getParameterByName('autoplay2');
  if (autoplay2Str) {
	$("#AutoPlay2").prop("checked", autoplay2Str == "true");
    compPlays[1] = autoplay2Str=="true";
  }
  
}

function copyGameToClipboard(event) {
  var urlBase = getUrlBase();
  var urlBaseQ = urlBase + "?";

  var model1Param = "model1=" + $("#ModelSelect1").val();
  var model2Param = "&model2=" + $("#ModelSelect2").val();

  var skill1Param = "&skill1=" + $("#Skill1").val();
  var skill2Param = "&skill2=" + $("#Skill2").val();

  var autoPlay1Param = "&autoplay1=" + $("#AutoPlay1").prop('checked')
  var autoPlay2Param = "&autoplay2=" + $("#AutoPlay2").prop('checked')

  var url = urlBaseQ + model1Param + model2Param + skill1Param + skill2Param + autoPlay1Param + autoPlay2Param;

  if (discs.length == 1) {
    copyToClipboard(url);
    return;
  }

  // If there's a hovering disc, don't include it.
  lastIdx = discs[discs.length-1].dropped ? discs.length-1 : discs.length-2;
  pos = [];
  for (i = 0; i <= lastIdx; i++) {
    pos.push(discs[i].row + ',' + discs[i].col);
  }
 
  var discsParam = "&discs=" + pos.join(';')
  url = url + discsParam;
  copyToClipboard(url);
  // To change URL:
  // window.history.pushState('', '', qStr);
  event.preventDefault();
}

function getUrlBase() {
  return window.location.href.split('?')[0];
}
window.Clipboard = (function(window, document, navigator) {
    var textArea,
        copy;

    function isOS() {
        return navigator.userAgent.match(/ipad|iphone/i);
    }

    function createTextArea(text) {
        textArea = document.createElement('textArea');
        textArea.value = text;
        document.body.appendChild(textArea);
    }

    function selectText() {
        var range,
            selection;

        if (isOS()) {
            range = document.createRange();
            range.selectNodeContents(textArea);
            selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            textArea.setSelectionRange(0, 999999);
        } else {
            textArea.select();
        }
    }

    function copyToClipboard() {        
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }

    copy = function(text) {
        createTextArea(text);
        selectText();
        copyToClipboard();
    };

    return {
        copy: copy
    };
})(window, document, navigator);

function copyToClipboard(str) {
  Clipboard.copy(str);
  $('#clipboard-modal').modal('show');
  window.scrollTo(0, 0);
}

async function loadNewModel(player) {
  models[player - 1] = null;
  document.getElementById("result").textContent = "Loading model...";
  var modelDir = document.getElementById("ModelSelect" + player).value;
  models[player - 1] = await loadModel(modelDir);
  updatePredictions();
}

async function loadModel(modelDir) {
  return await tf.loadModel('models/' + modelDir + '/model.json');
}

function autoPlay(player) {
  compPlays[player - 1] = document.getElementById("AutoPlay" + player).checked;
  if (currentPlayer == player) {
    computerMaybePlay();
  }
}

function computerToPlay() {
  return compPlays[currentPlayer-1];
}

function computerMaybePlay() {
  if (computerToPlay()) {
    disc = discs[discs.length - 1];
    if (predReady[currentPlayer]) {
      setTimeout(function() {
        playBestMove(disc);
      }, 1250);
    } else {
      var player = currentPlayer;
      document.addEventListener("predReady", function(e) {
        if (e.detail.player == player) {
          playBestMove(disc);
        }
      }, {once: true});
    }
  }
}

function applyT(T, priors) {
  T = Math.floor(T);
  if (T == 1) {
    T = 1;
  } else if (T == 2) {
    T = 0.8;
  } else if (T == 3) {
    T = 0.66;
  } else if (T == 4) {
    T = 0.5;
  } else if (T == 5) {
    T = 0.25;
  } else if (T == 6) {
    T = 0.1;
  } else if (T == 7) {
    T = 0.01;
  }
  var adjustedPriors = [];
  var adjustedTotal = 0;
  for (var i = 0; i < 7; i++) {
    adjustedPriors[i] = priors[i] ** (1/T);
    adjustedTotal += adjustedPriors[i];
  }
  for (var i = 0; i < 7; i++) {
    adjustedPriors[i] /= adjustedTotal;
  }
  return adjustedPriors;
}

function argmax(array) {
  max = -1;
  maxIdx = 0;
  for (i = 0; i < array.length; i++) {
    if (possibleColumns().indexOf(i) != -1) {
      if (array[i] > max) {
        max = array[i];
        maxIdx = i;
      }
    }
  }
  return maxIdx;
}

function weightedChoice(array) {
  array = array.slice();;
  var total = 0.0;
  for (var i = 0; i < array.length; i++) {
    if (possibleColumns().indexOf(i) == -1) {
      array[i] = 0;
    }
    total += array[i]; 
  }
  for (var i = 0; i < array.length; i++) {
    array[i] /= total; 
  }
  var r = Math.random();
  var cur = 0.0;
  for (var i = 0; i < array.length; i++) {
    cur += array[i];
    if (r <= cur) {
      return i;
    }
  }
  alert('oh no');
}

function playBestMove(disc) {
  var T = 1;
  if (disc.player==1) {
    T = document.getElementById('Skill1').value;
  } else {
    T = document.getElementById('Skill2').value;
  }

  var adjustedPriors = applyT(T, priors);
  col = weightedChoice(adjustedPriors);
  dropDisc(disc, col);
}

function updatePredictions() {
  model = models[currentPlayer - 1];
  if (model == null) {
    return;
  }

  b = [
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,

    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
  ]
  var x = document.getElementsByClassName("disc");
  p = currentPlayer - 1;
  current = p == 0 ? 1 : 2;
  other = p == 0 ? 2 : 1;
  for (var r = 0; r < gameField.length; r++) {
    for (var c = 0; c < gameField[0].length; c++) {
      if (gameField[r][c] == current) {
        b[r * 7 + c] = 1;
      } else if (gameField[r][c] == other) {
        b[r * 7 + c + 42] = 1;
      }
    };
  };

  input = tf.tensor4d(b, [1, 2, 6, 7])
  result = model.predict(input);
  priors = result[0].dataSync()
  value = result[1].dataSync()[0]
  var T = 1;
  if (p==0) {
    T = document.getElementById('Skill1').value;
  } else {
    T = document.getElementById('Skill2').value;
  }

  var adjustedPriors = applyT(T, priors);

  for (var i = 0; i < 7; i++) {
    document.getElementById('s' + i).textContent = Math.round(adjustedPriors[i] * 100) + "%";
  }
  percentage = Math.floor(Math.abs(value) * 100) + "%";
  var message = "looks like a draw";
  var pcolor = "red"
  if (p == 1) {
    pcolor = "yellow";
  }
  if (value < -0.05 || value > 0.05) {
    color = "red";
    if ((p == 0 && value < -0.05) || (p == 1 && value > 0.05)) {
      color = "yellow";
    }
    message = "I am " + percentage + " confident " + color + " will win"
  }

  if (p == 0) {
    message = "Red <small>(" + $('#ModelSelect1 option:selected').text() + ")</small> thinks:<br/> " + message;
  } else {
    message = "Yellow <small>(" + $('#ModelSelect2 option:selected').text() + ")</small> thinks:<br/> " + message;
  }

  document.getElementById("result").innerHTML = message;
  predReady[currentPlayer] = true;
  document.dispatchEvent(new CustomEvent("predReady", {
    detail: {
      player: currentPlayer
    }}));
}

window.onload = function() {
  compPlays[0] = $("#AutoPlay1").prop('checked');
  compPlays[1] = $("#AutoPlay2").prop('checked');

  newGame(true);
  loadModels();
  $('#message-modal').on('hidden.bs.modal', function (e) {
    newGame();
  })

  $("select").focus(function () {
//    window.scrollTo(0, 0);
//    document.body.scrollTop = 0;
  });
};

function checkForTie() {
  return possibleColumns().length == 0;
}

function checkForVictory(row, col) {
  if ((getAdj(row, col, 0, 1) + getAdj(row, col, 0, -1) > 2) ||
      (getAdj(row, col, 1, 0) > 2) ||
      (getAdj(row, col, -1, 1) + getAdj(row, col, 1, -1) > 2) ||
      (getAdj(row, col, 1, 1) + getAdj(row, col, -1, -1) > 2)) {
    return true;
  }
}

function getAdj(row, col, row_inc, col_inc) {
  if (cellVal(row, col) == cellVal(row + row_inc, col + col_inc)) {
    return 1 + getAdj(row + row_inc, col + col_inc, row_inc, col_inc);
  } else {
    return 0;
  }
}

function cellVal(row, col) {
  if (gameField[row] == undefined || gameField[row][col] == undefined) {
    return -1;
  } else {
    return gameField[row][col];
  }
}

function firstFreeRow(col) {
  var i;
  for (i = 0; i < 6; i++) {
    if (gameField[i][col] != 0) {
      break;
    }
  }
  return i - 1;
}

function possibleColumns() {
  var moves_array = new Array();
  for (var i = 0; i < 7; i++) {
    if (gameField[0][i] == 0) {
      moves_array.push(i);
    }
  }
  return moves_array;
}

var isSafari = !!navigator.userAgent.match(/Version\/[\d\.]+.*Safari/);

var hSize = 91.4;
var vSize = 77.75;
var hOff = 10.75;
var vOff = 7;

if (isSafari) {
    vOff = 8.25;
    vSize = 77.8;
}

var maxScale = 0.75;
var scale = 0.75;

function doResize() {
  var w = $(window).width();
  if (w < 768) {
    scale = (w/692);
  } else {
    scale = maxScale;
  }
  $("#game-outer").attr("style", "transform: scale(" + scale + "); transform-origin: 0 0;");
  $("#leftcol").attr("style", "height: " + 600 * scale + "px; padding-top:" + 30 * (scale**3) + "px;");
}

window.addEventListener("resize", function() {
  window.setTimeout(doResize, 100);
});

doResize()

function Disc(player, col) {
  this.player = player;
  this.color = player == 1 ? 'red' : 'yellow';
  this.id = 'd' + id.toString();
  this.row = 0;
  this.col = col;
  this.dropped = false;
  id++;

  this.addToScene = function() {
    var disc = document.createElement("div");
    disc.id = this.id
    disc.className = "disc " + this.color;
    board.appendChild(disc)
    document.getElementById($this.id).style.left = (hOff + hSize * this.col) + "px";
    document.getElementById($this.id).style.top = "-75px";
  }

  var $this = this;
  
  this.moveToColumn = function(col) {
    $this.col = col;
    document.getElementById($this.id).style.left = (hOff + hSize * col) + "px";
    document.getElementById($this.id).style.top = "-75px";
  }
  
  document.onmousemove = function(evt) {
    col = getCol(evt.clientX);
    if (col < 0) {
      col = 0;
    }
    if (col > 6) {
      col = 6;
    }
    $this.moveToColumn(col);
  }
  
  document.onload = function(evt) {
    document.onmousemove();
  }

  var lastClick = 0;
  document.getElementById("board").onclick = function(evt) {
    var now = new Date().getTime();
    if (now - lastClick < 1000) {
      return;
    }
    lastClick = now;
    if (compPlays[$this.player - 1]) {
		return;
    }

    row = getRow(evt.clientY);
    col = getCol(evt.clientX);
    if (row >= 0 && row < 6 && possibleColumns().indexOf(col) != -1) {
      dropDisc($this, col);
    }
  }
}

function getRow(y) {
  y = y - $('#game-table').offset().top + vSize;
  return Math.floor(y/vSize);
}

function getCol(x) {
  x = x - $('#game-table').offset().left;
  x = x/scale;
  return Math.floor(x/(hSize+1));
}

// Used only when loading an existing game.
function placeDisc(disc, row, col) {
  disc.dropped = true;
  disc.moveToColumn(col);
  disc.row = row;
  gameField[row][disc.col] = disc.player;

  element = document.getElementById(disc.id);
  element.style.top = (vOff + row * vSize) + 'px';
}

function dropDisc(disc, col) {
  if (disc.dropped) {
    return;
  }
  disc.dropped = true;
  disc.moveToColumn(col);
  row = firstFreeRow(disc.col);
  disc.row = row;
  gameField[row][disc.col] = disc.player;
  predReady[currentPlayer] = false;
  
  element = animateDiscDrop(disc.id, (vOff + row * vSize));
  document.onmousemove = null;
  document.onclick = null;
  element.addEventListener("transitionend", function(e) {
  // transitionend fires twice (for horizontal and vertical motion) if
  // the disc hasn't caught up with the mouse's column.
  if (e.propertyName == 'top') {
    if (checkForVictory(disc.row, disc.col)) {
    var color = disc.player == 2 ? 'Yellow' : 'Red';
    $("#modal-title-text").html(color + " wins!");
    $('#message-modal').modal('show');
        window.scrollTo(0, 0);
      } else if (checkForTie()) {
    $("#modal-title-text").html("It's a tie!");
    $('#message-modal').modal('show');
        window.scrollTo(0, 0);
    } else {
    changePlayer();
    updatePredictions();
    addNewDisc(disc.col);
    }
  }
  });
}

function changePlayer() {
  currentPlayer = 3 - currentPlayer;
}

function addNewDisc(col) {
  disc = new Disc(currentPlayer, col);
  disc.addToScene();
  discs.push(disc);
  computerMaybePlay(); 
  return disc;
}

function prepareField() {
  gameField = new Array();
  for (var i = 0; i < 6; i++) {
    gameField[i] = new Array();
    for (var j = 0; j < 7; j++) {
      gameField[i].push(0);
    }
  }
}

function animateDiscDrop(who, where) {
  element = document.getElementById(who);
  // Run async to allow page to render. Otherwise it's possible that the disc
  // creation and position update happen in the same JS cycle, preventing the
  // transition from firing.
  setTimeout(function(element) {
    element.style.top = where + 'px';
  }, 0, element);
  
  if (isSafari) {
    var sound = new Audio('disc-drop-fast.m4a');
    sound.volume = 0.35;
    sound.play();
  } else {
    var sound = new Audio('disc-drop.m4a');
    sound.volume = 0.35;
    sound.play();
  }
  return element;
}

function undo() {
  if (computerToPlay()) {
    return;
  }

  disc = discs[discs.length - 1];
  if (!disc.dropped) {
    hoveringDisc = discs.pop();
    board.removeChild(document.getElementById(hoveringDisc.id));
  }

  if (discs.length > 0) {
    lastDisc = discs.pop();
    board.removeChild(document.getElementById(lastDisc.id));
    gameField[lastDisc.row][lastDisc.col] = 0;
    changePlayer();
  }
 
  if (computerToPlay()) {
    lastDisc = discs.pop();
    board.removeChild(document.getElementById(lastDisc.id));
    gameField[lastDisc.row][lastDisc.col] = 0;
    changePlayer();
  }

  addNewDisc(0);
  updatePredictions();
}

document.getElementById('Skill2').oninput = function() {
  updatePredictions();
}

document.getElementById('Skill1').oninput = function() {
  updatePredictions();
}

const WIDTH = 350;
const HEIGHT = 350;
const STROKE_WEIGHT = 3;
const CROP_PADDING = (REPOS_PADDING = 2);

let model;
let pieChart;
let clicked = false;
let mousePosition = [];

// Coordinates of the current drawn stroke [[x1, x2, ..., xn], [y1, y2, ..., yn]]
let strokePixels = [[], []];

// Coordinates of all canvas strokes [[[x1, x2, ..., xn], [y1, y2, ..., yn]], [[x1, x2, ..., xn], [y1, y2, ..., yn]], ...]
let imageStrokes = [];
let imageStrokes_copy = [];
function inRange(n, from, to) {
    return n >= from && n < to;
}

let speechEnabled  = false;

function toggleSpeechMode() {
  speechEnabled = !speechEnabled; // Toggle speechEnabled's state value
  const speechButton = document.getElementById("speech");
  speechButton.classList.toggle("active", speechEnabled);

  if (speechEnabled && isSpeechSynthesisSupported() ) {
      speechButton.style.backgroundColor = "green"; // To set the color of the Speech button to green when the speech mode is turned on
      speechButton.style.color = "white";

      // If the browser supports the speechSynthesis feature and is not currently speaking
      if (isSpeechSynthesisSupported() && !window.speechSynthesis.speaking && predict_e.length > 0 && eraseMode == false) {
        Speaking();
      }
  } else {
      speechEnabled = false;
      speechButton.style.backgroundColor = ""; // To set the color of the Speech button to orange when the speech mode is turned off
      speechButton.style.color = "black";

      // Stop the browser from speaking
      if (isSpeechSynthesisSupported() && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
      }
  }
}
function setup() {
  createCanvas(WIDTH, HEIGHT);
  strokeWeight(STROKE_WEIGHT);
  stroke("black");
  background("#FFFFFF");
  const $canvas = document.getElementById("defaultCanvas0");
  loadModel();
  $canvas.addEventListener("mousedown", (e) => mouseDown(e));
  $canvas.addEventListener("mousemove", (e) => mouseMoved(e));
  $canvas.addEventListener("mouseup", (e) => mouseReleased(e));
  const eraseButton = document.getElementById("erase");
  eraseButton.addEventListener("click", toggleEraseMode);

  const speechButton = document.getElementById("speech");
  speechButton.addEventListener("click", toggleSpeechMode);
  
}


function mouseDown() {
    clicked = true;
    mousePosition = [mouseX, mouseY];
    Stop_talking_clear_pie_iframe();
}
let eraseMode = false;
function mouseMoved() {
    if (eraseMode && clicked && inRange(mouseX, 0, WIDTH) && inRange(mouseY, 0, HEIGHT)) {
        // To remove a drawing at the mouse position
        const mouseXPos = Math.floor(mouseX);
        const mouseYPos = Math.floor(mouseY);
    
        // To find and remove the drawing near the mouse position
        for (let i = imageStrokes.length - 1; i >= 0; i--) {
          const stroke = imageStrokes[i];
          const xCoords = stroke[0];
          const yCoords = stroke[1];
    
          for (let j = 0; j < xCoords.length; j++) {
            const x = xCoords[j];
            const y = yCoords[j];
            
            // To check if the mouse position is near a drawing point and perform an action accordingly
            if (dist(x, y, mouseXPos, mouseYPos) < STROKE_WEIGHT * 2) {
              // To clear the drawing and exit the clean loop
              imageStrokes.splice(i, 1);
              break;
            }
          }
        }
        
        // Clear the canvas and redraw the remaining segments
        clear();
        background("#FFFFFF");
        for (const stroke of imageStrokes) {
          const xCoords = stroke[0];
          const yCoords = stroke[1];
    
          for (let i = 1; i < xCoords.length; i++) {
            const x1 = xCoords[i - 1];
            const y1 = yCoords[i - 1];
            const x2 = xCoords[i];
            const y2 = yCoords[i];
    
            line(x1, y1, x2, y2);
          }
        }
      }
    else {
    // Check whether mouse position is within canvas
    if (clicked && inRange(mouseX, 0, WIDTH) && inRange(mouseY, 0, HEIGHT)) {
        //clicked = true;
        strokePixels[0].push(Math.floor(mouseX));
        strokePixels[1].push(Math.floor(mouseY));

        line(mouseX, mouseY, mousePosition[0], mousePosition[1]);
        mousePosition = [mouseX, mouseY];
    }
}
}




function toggleEraseMode() {
  eraseMode = !eraseMode; // Toggle eraseMode's state value
  const eraseButton = document.getElementById("erase");
  eraseButton.classList.toggle("active", eraseMode);

  if (eraseMode) {
    eraseButton.style.backgroundColor = "red"; // Set the erase button color to red when in erase mode
    eraseButton.style.color = "white";
  } else {
    eraseButton.style.backgroundColor = ""; // Set the erase button color to default when not in erase mode
    eraseButton.style.color = "black";
  }
  // Stop the browser from speaking
  Stop_talking_clear_pie_iframe();
}

  
function mouseReleased() {
    if (strokePixels[0].length) {
        imageStrokes.push(strokePixels);
        strokePixels = [[], []];
    }
    clicked = false;
}
function updateViewport() {
    const deviceWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    const deviceHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    const scaleRatio = deviceWidth / deviceHeight; // Varies according to the original size of the HTML
  
    // Update viewport property
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    viewportMeta.content = `width=device-width, initial-scale=${scaleRatio}, user-scalable=no`;
}
const loadModel = async () => {
    console.log("Model loading...");

    model = await tflite.loadTFLiteModel("./models/model.tflite");
    model.predict(tf.zeros([1, 28, 28, 1])); // warmup

    console.log(`Model loaded! (${LABELS.length} classes)`);
};

const preprocess = async (cb) => {
    const {min, max} = getBoundingBox();

    // Resize to 28x28 pixel & crop
    const imageBlob = await fetch("/transform", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        redirect: "follow",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({
            strokes: imageStrokes_copy,
            box: [min.x, min.y, max.x, max.y],
        }),
    }).then((response) => response.blob());

    const img = new Image(28, 28);
    img.src = URL.createObjectURL(imageBlob);

    img.onload = () => {
        const tensor = tf.tidy(() =>
            tf.browser.fromPixels(img, 1).toFloat().expandDims(0)
        );
        cb(tensor);
    };
};

const drawPie = (top5) => {
    const probs = [];
    const labels = [];

    for (const pred of top5) {
        const prop = +pred.probability.toPrecision(3);
        probs.push(prop);
        labels.push(`${pred.className} (${prop})`);
    }

    const others = +(
        1 - probs.reduce((prev, prob) => prev + prob, 0)
    ).toPrecision(3);
    probs.push(others);
    labels.push(`Others (${others})`);

    if (pieChart) pieChart.destroy();

    const ctx = document.getElementById("predictions").getContext("2d");
    pieChart = new Chart(ctx, {
        type: "pie",
        options: {
            plugins: {
                legend: {
                    position: "bottom",
                },
                title: {
                    display: true,
                    text: "Top 5 Predictions",
                },
            },
        },
        data: {
            labels,
            datasets: [
                {
                    label: "Top 5 predictions",
                    data: probs,
                    backgroundColor: [
                        "rgb(255, 99, 132)",
                        "rgb(54, 162, 235)",
                        "rgb(255, 205, 86)",
                        "rgb(0,255,0)",
                        "rgb(238,130,238)",
                        "rgb(97,96,96)",
                    ],
                },
            ],
        },
    });
};

const getMinimumCoordinates = () => {
    let min_x = Number.MAX_SAFE_INTEGER;
    let min_y = Number.MAX_SAFE_INTEGER;

    for (const stroke of imageStrokes_copy) {
        for (let i = 0; i < stroke[0].length; i++) {
            min_x = Math.min(min_x, stroke[0][i]);
            min_y = Math.min(min_y, stroke[1][i]);
        }
    }

    return [Math.max(0, min_x), Math.max(0, min_y)];
};

const getBoundingBox = () => {
    repositionImage();

    const coords_x = [];
    const coords_y = [];

    for (const stroke of imageStrokes_copy) {
        for (let i = 0; i < stroke[0].length; i++) {
            coords_x.push(stroke[0][i]);
            coords_y.push(stroke[1][i]);
        }
    }

    const x_min = Math.min(...coords_x);
    const x_max = Math.max(...coords_x);
    const y_min = Math.min(...coords_y);
    const y_max = Math.max(...coords_y);

    // New width & height of cropped image
    const width = Math.max(...coords_x) - Math.min(...coords_x);
    const height = Math.max(...coords_y) - Math.min(...coords_y);

    const coords_min = {
        x: Math.max(0, x_min - CROP_PADDING), // Create link edge
        y: Math.max(0, y_min - CROP_PADDING), // Create the top edge
    };
    let coords_max;

    if (width > height)
        // Left + right edge as boundary
        coords_max = {
            x: Math.min(WIDTH, x_max + CROP_PADDING), // Right edge
            y: Math.max(0, y_min + CROP_PADDING) + width, // Lower edge
        };
    // Upper + lower edge as boundary
    else
        coords_max = {
            x: Math.max(0, x_min + CROP_PADDING) + height, // Right edge
            y: Math.min(HEIGHT, y_max + CROP_PADDING), // Lower edge
        };

    return {
        min: coords_min,
        max: coords_max,
    };
};

// Reposition image to top left corner
const repositionImage = () => {
    const [min_x, min_y] = getMinimumCoordinates();
    for (const stroke of imageStrokes_copy) {
        for (let i = 0; i < stroke[0].length; i++) {
            stroke[0][i] = stroke[0][i] - min_x + REPOS_PADDING;
            stroke[1][i] = stroke[1][i] - min_y + REPOS_PADDING;
        }
    }
};

function updateIframebutton(str_c) {
    const bingFrame = document.getElementById("bingFrame");
    bingFrame.style.display = str_c;
    const showNextPredictionButton = document.getElementById("showNextPrediction");
    showNextPredictionButton.style.display = str_c;
}

let predict_e =[];
let currentIndex = 0;
function help_copy_array(obj) {
    if(obj == null || typeof(obj) != 'object') {
      return obj;
    }
  
    var temp = new obj.constructor();
  
    for(var key in obj) {
      if (obj.hasOwnProperty(key)) {
        temp[key] = help_copy_array(obj[key]);
      }
    }
  
    return temp;
}

// Function to read an element in the array predict_e
function speakPrediction(prediction) {
  var utterance = new SpeechSynthesisUtterance(prediction);
  window.speechSynthesis.speak(utterance);
}

// Checking compatibility with SpeechSynthesis
function isSpeechSynthesisSupported() {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}
function Speaking() {
  let sp_spech = 0;
  for (let prediction of predict_e) {
      if (sp_spech == 0)
      {
        prediction = "Well, I can see in your painting that may be "+ prediction;
        sp_spech = 1;
      }
      else if(prediction == predict_e.at(-1))
      {
        prediction = ", or "+ prediction;
      }
      else{
        prediction = ", "+ prediction;
      }
      speakPrediction(prediction);
  }
}
// Prediction function with reading function
const predict = async () => {
  if (!imageStrokes.length) return;
  if (!LABELS.length) throw new Error("No labels found!");
  if (isSpeechSynthesisSupported() && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  imageStrokes_copy = [];
  imageStrokes_copy = help_copy_array(imageStrokes);

  preprocess(async (tensor) => {
    const predictions = model.predict(tensor).dataSync();

    top5 = Array.from(predictions)
      .map((p, i) => ({
        probability: p,
        className: LABELS[i],
        index: i,
      }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);

    drawPie(top5);
    predict_e = top5.map(pred => pred.className);
    currentIndex = 0;
    updateIframebutton("inline");
    updateIframe(predict_e[currentIndex]);
    // Checking compatibility with SpeechSynthesis
    if (isSpeechSynthesisSupported() && speechEnabled == true) {
      Speaking();
    } 
    else {
    console.log("Trình duyệt không hỗ trợ đọc văn bản.");
    }

    
  });
};




function showNextPrediction() {
  currentIndex++;
  if (currentIndex >= predict_e.length) {
    currentIndex = 0;
  }

  const currentPrediction = predict_e[currentIndex];
  updateIframe(currentPrediction);
}

function updateIframe(searchQuery) {
  const bingFrame = document.getElementById("bingFrame");
  if (searchQuery == 'line')
  {
    searchQuery = 'Straight line';
  }
  if (searchQuery == 'bush')
  {
    searchQuery = 'Bush Landscaping';
  }
  const bingSearchURL = `https://www.bing.com/images/search?q=${encodeURIComponent(searchQuery)} picture`;
  bingFrame.src = bingSearchURL;
}

function Stop_talking_clear_pie_iframe()
{
  // Stop browser speech if currently speaking
  if (isSpeechSynthesisSupported() && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  if (pieChart) pieChart.destroy();
  updateIframebutton("none");
  currentIndex = 0;
  predict_e = [];

}

const clearCanvas = () => {
    clear();
    Stop_talking_clear_pie_iframe();
    background("#FFFFFF");
    imageStrokes = [];
    imageStrokes_copy = [];
    strokePixels = [[], []];
};

window.addEventListener('load', updateViewport);
window.addEventListener('resize', updateViewport);
window.addEventListener('load', () => {
    const showNextPredictionButton = document.getElementById("showNextPrediction");
    showNextPredictionButton.addEventListener("click", showNextPrediction);
  });
window.onload = () => {
    updateIframebutton("none");
    const $submit = document.getElementById("predict");
    const $clear = document.getElementById("clear");
    $submit.addEventListener("click", () => predict());
    $clear.addEventListener("click", clearCanvas);
};


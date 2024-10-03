import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.153.0/build/three.module.js';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm/controls/OrbitControls.js';
import {TrackballControls} from 'https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm/controls/TrackballControls.js';
import {OBJLoader} from 'https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm/loaders/OBJLoader.js';
import {MTLLoader} from 'https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm/loaders/MTLLoader.js';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {GUI} from 'three/addons/libs/lil-gui.module.min.js';

window.onload = function() {
    // Create a <base> element
    var base = document.createElement('base');
    
    // Dynamically set the base URL
    var baseURL = window.location.origin + window.location.pathname; // This gives you the current URL path
    base.href = baseURL; // For example, 'https://a.com/b/'
    
    // Append the <base> tag to the <head> of the document
    document.head.appendChild(base);
};

// Get the audio element

const audioElement = document.getElementById("audio");
// Set the src of the audio element

const urlParams = new URLSearchParams(window.location.search);
let pieceId = parseInt(urlParams.get('id'));
if (!pieceId) {
    pieceId = 0;
}
console.log("Piece ID:", pieceId);
audioElement.src = `data/${pieceId}/audio.mp3`;
// Wait until the audio's readyState is at least 4 (HAVE_ENOUGH_DATA)
while (audioElement.readyState < 4) {
    console.log("Waiting for audio to load...");
    await new Promise(resolve => setTimeout(resolve, 1000));  // Wait 1 second before checking again
}
let totalFrames = 0;
let totalDuration = -1;
let loadedFrames = 0;
let keyObjs = {};


document.getElementById('volumeControl').addEventListener('input', () => {
    audio.volume = volumeControl.value;
    if (audio.volume === 0) {
        volumeIcon.className = 'fas fa-volume-mute';  // Mute icon
    } else if (audio.volume <= 0.5) {
        volumeIcon.className = 'fas fa-volume-down';  // Lower volume icon
    } else {
        volumeIcon.className = 'fas fa-volume-up';  // Full volume icon
    }
});

async function fetchMetaData() {
    const url = `data/${pieceId}/metadata.json`;
    // read the data from
    const response = await fetch(url);
    const jsonData = await response.json();  // Parse JSON response
    return jsonData;
}

async function fetchFacesData() {
    const url = `assets/mano_faces.json`;
    const response = await fetch(url);
    const jsonData = await response.json();
    return jsonData;
}

// Define IndexedDB setup
const dbName = "MeshFramesDB";
let db;

// Define an array of 2000 frames
let frames = new Array(2000);
// define preloadFrames
let preloadedFrames = {};
const preloadedWindowSize = 600;

// Function to preload a window of frames
async function preloadFramesAround(currentFrameIndex) {
    const startFrame = currentFrameIndex
    const endFrame = Math.min(totalFrames, currentFrameIndex + preloadedWindowSize);

    // Loop through the frames in the window and preload them
    for (let i = startFrame; i < endFrame; i++) {
        if (!preloadedFrames[i]) {  // If frame is not already loaded
            try {
                const frameData = await getFrameFromDB(i);
                preloadedFrames[i] = frameData;
            } catch (error) {
                console.error(`Error preloading frame ${i}:`, error);
            }
        }
    }

    // Remove frames that are too old from the object
    Object.keys(preloadedFrames).forEach(frameIndex => {
        if (frameIndex < startFrame || frameIndex > endFrame) {
            delete preloadedFrames[frameIndex];
        }
    });
}

function getPreloadedFrame(frameIndex) {
    return preloadedFrames[frameIndex];
}

// Open or create IndexedDB database
async function openDB() {
    await deleteDatabase();
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            // Create an object store for frames with the frame index as the key
            const objectStore = db.createObjectStore("frames", {keyPath: "index"});
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log("IndexedDB opened successfully");
            resolve();
        };

        request.onerror = (event) => {
            console.error("Error opening IndexedDB:", event.target);
            reject();
        };
    });
}

function deleteDatabase() {
    return new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(dbName);

        deleteRequest.onsuccess = () => {
            console.log("Database deleted successfully.");
            resolve();
        };

        deleteRequest.onerror = (event) => {
            console.error("Error deleting database:", event.target.errorCode);
            reject();
        };

        deleteRequest.onblocked = () => {
            console.warn("Database deletion blocked. Close other tabs using this database.");
        };
    });
}

function printAllFramesInDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["frames"], "readonly");
        const objectStore = transaction.objectStore("frames");

        const allFrames = [];
        const request = objectStore.openCursor();  // Open a cursor to iterate over all entries

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                // Add frame data to array and print it
                allFrames.push(cursor.value);
                cursor.continue();  // Move to the next entry
            } else {
                console.log("All frames in the database:", allFrames);  // Print entire array after iteration
                resolve(allFrames);  // Resolve the promise with all the frame data
            }
        };

        request.onerror = (event) => {
            console.error("Error reading from IndexedDB:", event.target.errorCode);
            reject(event.target.errorCode);
        };
    });
}

function storeFrameInDB_(frameIndex, frameData) {
    frames[frameIndex] = frameData;
    return Promise.resolve();
}

// Store frame in IndexedDB
function storeFrameInDB(frameIndex, frameData) {
    // console.log("Storing frame:", frameIndex);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["frames"], "readwrite");
        const objectStore = transaction.objectStore("frames");
        const request = objectStore.add({index: frameIndex, data: frameData});

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = (event) => {
            console.error("Error storing frame:", event.target, event);
            reject();
        };
    });
}

function getFrameFromDB_(frameIndex) {
    const frameData = frames[frameIndex];
    if (frameData) {
        return Promise.resolve(frameData);
    } else {
        // throw an error
        return Promise.reject("Frame not found in IndexedDB");
    }
}

// Retrieve frame from IndexedDB
function getFrameFromDB(frameIndex) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["frames"], "readonly");
        const objectStore = transaction.objectStore("frames");
        const request = objectStore.get(frameIndex);

        request.onsuccess = (event) => {
            if (event.target.result) {
                resolve(event.target.result.data);
            } else {
                reject("Frame not found in IndexedDB");
            }
        };

        request.onerror = (event) => {
            console.error("Error retrieving frame:", event.target, "Frame index:", frameIndex);
            reject();
        };
    });
}

// Fetch mesh data and store in IndexedDB
async function fetchMeshData() {
    const url = `data/${pieceId}/motion.json`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";  // Buffer to hold incoming data

    const loadingText = document.getElementById('loadingText');

    let startTime = Date.now();  // Record the start time

    while (true) {
        const {done, value} = await reader.read();

        if (done) {
            break;
        }

        const chunkText = decoder.decode(value, {stream: true});
        buffer += chunkText;

        let parts = buffer.split('\n');
        buffer = parts.pop();  // Keep incomplete part in buffer

        // Sequential processing using for...of
        for (const frameJson of parts) {
            try {
                const frameData = JSON.parse(frameJson);
                // console.log("Processing frame:", loadedFrames);  // Debugging line

                // Store frame in IndexedDB sequentially
                await storeFrameInDB(loadedFrames, frameData);
                loadedFrames++;  // Increment after storing the frame

                const percentage = (loadedFrames / totalFrames) * 100;
                document.getElementById('bufferedBar').style.width = percentage + '%';


                const elapsedTime = (Date.now() - startTime) / 1000;
                const loadRate = loadedFrames / elapsedTime;
                const framesRemaining = totalFrames - loadedFrames;
                const timeRemaining = framesRemaining / loadRate;
                const minutes = Math.floor(timeRemaining / 60);
                const seconds = Math.floor(timeRemaining % 60);

                const elapsedTimeMinutes = Math.floor(elapsedTime / 60);
                const elapsedTimeSeconds = Math.floor(elapsedTime % 60);

                let text = `Loading... ${Math.floor(percentage)}% <br />`
                text += `ETA: ${minutes}m ${seconds}s <br />`
                text += `Elapsed time: ${elapsedTimeMinutes}m ${elapsedTimeSeconds}s`;
                loadingText.innerHTML = text;
            } catch (e) {
                console.error("Error parsing/storing frame:", e);
            }
        }
    }

    loadingText.innerHTML = 'Loading... 100% <br /> Elapsed time: ' + Math.floor((Date.now() - startTime) / 1000) + 's';
}

// Fetch frame from IndexedDB for rendering
async function fetchFrameForRendering(frameIndex) {
    try {
        const frameData = await getFrameFromDB(frameIndex);
        return frameData;
    } catch (error) {
        console.error("Error fetching frame for rendering:", error, "Frame index:", frameIndex);
        return null;
    }
}


async function main() {
    console.log("Starting application");
    // Setup the scene, camera, and renderer
    const scene = new THREE.Scene();
    const gui = new GUI();
    const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({canvas: document.getElementById('threeCanvas'), antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);


    const pmremGenerator = new THREE.PMREMGenerator(renderer);

    const hdriLoader = new RGBELoader()
    hdriLoader.load("assets/envmap.hdr", function (texture) {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        texture.dispose();
        scene.environment = envMap;
        scene.background = envMap;
        scene.backgroundBlurriness = 0.3;
    });

    const renderingParams = {
        handColor: 0xefceb9,
    }
    // gui.addColor(renderingParams, 'handColor').onChange((value) => {
    //     leftMesh.material.color.setHex(value);
    //     rightMesh.material.color.setHex(value);
    //     leftMaterial.material.needsUpdate = true;
    //     rightMaterial.material.needsUpdate = true;
    // });


    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 3);
    hemiLight.position.set(0, 20, 0);
    // scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(3, 10, 10);
    dirLight.castShadow = false;
    // scene.add(dirLight);

    // Setup OrbitControls
    const pianoCenter = new THREE.Vector3(0.61431422, -0.074, -0.0055);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.rotateSpeed = 0.5;
    // const controls = new TrackballControls(camera, renderer.domElement);
    // controls.rotateSpeed = 2.0;
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    // Define preset viewpoints
    const presets = {
        top: {
            position: {
                "x": 0.10484052758896953,
                "y": 1.4349854237546178,
                "z": -0.5999877881557593
            }, target: {
                "x": 0.1,
                "y": 0,
                "z": -0.6
            }
        },
        left: {
            position: {
                "x": 0.6998938717565077,
                "y": 1.0171497080001928,
                "z": 0.5578656721849795
            },
            target: {
                "x": 0.13180072175419472,
                "y": 1.5691260771514555e-19,
                "z": -0.5241889198249452
            },
        },
        right: {
            position: {
                "x": 0.6027349580836255,
                "y": 0.818198927359689,
                "z": -1.8632773667524538
            }, target: {
                "x": 0.06154058571770953,
                "y": 1.6977216676322782e-18,
                "z": -0.8159637729174926
            }
        }
    };

// Function to update camera and controls
    function updateCameraAndControls(preset) {
        camera.position.set(preset.position.x, preset.position.y, preset.position.z);
        controls.target.set(preset.target.x, preset.target.y, preset.target.z);
        controls.update();
    }

    // Set up GUI
    // const cameraFolder = gui.addFolder('Camera Presets');
    // // open the folder by default
    // cameraFolder.open();
    const cameraSettings = {
        preset: 'top'
    };

    gui.add(cameraSettings, 'preset', Object.keys(presets))
        .name('Camera Presets')
        .onChange((value) => {
            updateCameraAndControls(presets[value]);
        });
    updateCameraAndControls(presets.top);
    // Load all meshes
    // Create materials
    const whiteMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.2
    });

    const blackMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.4,
        metalness: 0.1
    });
    for (let i = 0; i < 88; i++) {
        const objLoader = new OBJLoader();
        const mtlLoader = new MTLLoader();

        const mesh_url = `assets/piano_meshes/${i}`;
        mtlLoader.load(mesh_url + '.mtl', function (materials) {
            materials.preload();
            const mat = Object.values(materials.materials)[0];
            if (isBlackKey(i + 1)) {
                mat.color.setHex(0x000000);
            } else {
                mat.color.setHex(0xffffff);
            }
            objLoader.setMaterials(materials);
            objLoader.load(mesh_url + '.obj', function (object) {
                object.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        // Apply PBR materials
                        child.material = isBlackKey(i + 1) ? blackMaterial.clone() : whiteMaterial.clone();

                        // Enable shadows
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                // rotate object 90 along x axis
                object.rotation.x = Math.PI / 2;
                scene.add(object);
                keyObjs[i] = object;
            });
        });
    }
    // Fetch the mesh data (vertices and faces)
    const metadata = await fetchMetaData();
    totalFrames = metadata.num_frames;
    document.getElementById('pieceInformation').innerHTML = `${metadata.name} <br /> by ${metadata.composer}`
    const fps = 60000 / 1001;
    totalDuration = totalFrames / fps;
    // update the duration of the audio
    const minutes = Math.floor(totalDuration / 60);
    const seconds = Math.floor(totalDuration % 60).toString().padStart(2, '0');
    document.getElementById('totalDuration').textContent = `${minutes}:${seconds}`;
    fetchMeshData();
    // wait until frames have more than 600 frames
    const preloadFrames = 60
    while (loadedFrames < preloadFrames) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const facesData = await fetchFacesData();
    // Extract vertices and faces for the left and right meshes
    const leftFaces = facesData.left_faces.flat();
    const rightFaces = facesData.right_faces.flat();

    // Ensure vertices are set for the first frame
    const leftGeometry = new THREE.BufferGeometry();
    const rightGeometry = new THREE.BufferGeometry();
    const numVertices = 778;

    const leftPositionAttribute = new Float32Array(numVertices * 3);
    const rightPositionAttribute = new Float32Array(numVertices * 3);

    leftGeometry.setAttribute('position', new THREE.BufferAttribute(leftPositionAttribute, 3));
    rightGeometry.setAttribute('position', new THREE.BufferAttribute(rightPositionAttribute, 3));

    leftGeometry.setIndex(leftFaces);
    rightGeometry.setIndex(rightFaces);


    const leftMaterial = new THREE.MeshStandardMaterial({
        // a color that resembs hand
        color: renderingParams.handColor,
        roughness: 1.0,
        metalness: 1.0
    });

    const rightMaterial = leftMaterial.clone();

    // const leftMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000});
    // const rightMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff});

    const leftMesh = new THREE.Mesh(leftGeometry, leftMaterial);
    leftMesh.frustumCulled = false;
    const rightMesh = new THREE.Mesh(rightGeometry, rightMaterial);
    rightMesh.frustumCulled = false;

    scene.add(leftMesh);
    scene.add(rightMesh);


    // camera.rotation.z = Math.PI / 2;
    console.log("Camera position:", camera.position);
    let axesHelper = new THREE.AxesHelper(20);
    axesHelper.rotation.x = Math.PI / 2;
    // scene.add(axesHelper);

    scene.rotation.x = -Math.PI / 2;

    let currentFrame = 0;

    // Initialize audio
    const audio = document.getElementById('audio');
    const playButton = document.getElementById('playPauseBtn');
    const playPauseIcon = document.getElementById('playPauseIcon');
    const scrubber = document.getElementById('scrubber');
    const bufferedBar = document.getElementById('bufferedBar');

    function isBlackKey(idx) {
        const blackKey = [1, 3, 6, 8, 10];
        // Ensure positive modulo and check if it matches a black key
        return blackKey.includes((idx + 8) % 12);
    }

    let isPlaying = false;
    // Play the audio
    playButton.addEventListener('click', () => {
        if (isPlaying) {
            audio.pause();
            playPauseIcon.className = 'fas fa-play';  // Change to pause icon

        } else {
            var promise = audio.play();
            // if (promise !== undefined) {
            //     promise.then(_ => {
            //         // Autoplay started
            //         console.log("Audio started");
            //     }).catch(error => {
            //         // Autoplay was prevented
            //         console.error("Autoplay prevented:", error);
            //     });
            // }
            playPauseIcon.className = 'fas fa-pause';  // Change to play icon
        }
        isPlaying = !isPlaying;
    });

    // Animation loop at 60fps
    const interval = 1000 / fps;


    // Periodically preload frames in the background (does not affect the rendering loop)
    setInterval(() => {
        const currentTime = audio.currentTime;
        const frameIndex = Math.floor(currentTime * fps);
        preloadFramesAround(frameIndex);
    }, 500);  // Preload frames every 500 milliseconds

    // a polling function for starting the animation when the frames are loaded
    async function playOnLoad(frameIndex) {
        if (!isPlaying) {
            return;
        }
        // console.log("Playing on load:", frameIndex);
        try {
            const frameData = await getFrameFromDB(frameIndex);
            if (frameData) {
                var promise = audio.play();
                // if (promise !== undefined) {
                //     promise.then(_ => {
                //         // Autoplay started
                //         console.log("Audio started");
                //     }).catch(error => {
                //         // Autoplay was prevented
                //         console.error("Autoplay prevented:", error);
                //     });
                // }
            } else {
                setTimeout(() => {
                    playOnLoad(frameIndex);
                }, 500);
            }
        } catch (error) {
            console.error("Error playing on load:", error);
        }
    }

    // Synchronization logic
    function syncAnimationAndAudio() {
        const currentTime = audio.currentTime;
        const frameIndex = Math.floor(currentTime * fps);
        if (frameIndex >= totalFrames) {
            audio.pause();
            return;
        }
        const frameDataThis = getPreloadedFrame(frameIndex);
        if (!frameDataThis) {
            audio.pause();
            // if (isPlaying) {
                playOnLoad(frameIndex);
            // }
            return;
        }
        // Update left mesh vertices for the current frame
        for (let i = 0; i < numVertices; i++) {
            for (let j = 0; j < 3; j++) {
                leftPositionAttribute[i * 3 + j] = frameDataThis.left_vertices[i][j];
                rightPositionAttribute[i * 3 + j] = frameDataThis.right_vertices[i][j];
            }
        }


        leftGeometry.computeVertexNormals();
        rightGeometry.computeVertexNormals();

        leftGeometry.attributes.position.needsUpdate = true;
        rightGeometry.attributes.position.needsUpdate = true;


        for (let i = 0; i < 88; i++) {
            const obj = keyObjs[i];
            const mat = keyObjs[i].children[0].material;
            if (frameDataThis.pressed_keys[i] > 0) {
                mat.color.setHex(0x00ff00);
                // also rotate the key
                obj.rotation.z = -Math.PI / 45;
            } else {
                obj.rotation.z = 0;
                if (isBlackKey(i + 1)) {
                    mat.color.setHex(0x000000);
                } else {
                    mat.color.setHex(0xffffff);
                }
            }
            mat.needsUpdate = true;
        }
        // Update the scrubber position
        scrubber.value = (currentTime / totalDuration) * 100;
        document.getElementById('timeDisplay').textContent = `${Math.floor(currentTime / 60)}:${Math.floor(currentTime % 60).toString().padStart(2, '0')}`;
        document.getElementById('playedBar').style.width = scrubber.value + "%";
    }

    syncAnimationAndAudio();
    
    audio.ontimeupdate = syncAnimationAndAudio;

    // 1. Using the readyState property
    function checkReadyState() {
        switch(audio.readyState) {
            case 0: console.log("HAVE_NOTHING - no information whether or not the audio is available"); break;
            case 1: console.log("HAVE_METADATA - metadata has been loaded"); break;
            case 2: console.log("HAVE_CURRENT_DATA - data is available for the current playback position, but not enough to actually play more than one frame"); break;
            case 3: console.log("HAVE_FUTURE_DATA - data for the current and at least the next frame is available"); break;
            case 4: console.log("HAVE_ENOUGH_DATA - enough data available to start playing"); break;
            default: console.log("Unknown ready state:", audio.readyState);
        }
    }

    scrubber.addEventListener('input', () => {
        const scrubberValue = scrubber.value;
        const newTime = scrubberValue / 100 * totalDuration;
        // checkReadyState();
        try {
            audio.currentTime = newTime;
        } catch (error) {
            console.error("Error setting audio time:", error);
        }
        // setTimeout(() => {
            syncAnimationAndAudio();
            // console.log("Scrubber value:", scrubberValue, "New time:", audio.currentTime, "expected new time", newTime);
        // }, 0);

    });


    function logCameraSettings() {
        console.log("Camera position:", camera.position);
        console.log("Camera rotation:", camera.rotation);
        console.log("Camera zoom", camera.zoom);
        console.log("Controls target", controls.target);
    }

    // log camera settings every 5 seconds
    // setInterval(logCameraSettings, 5000);

    function animate() {
        syncAnimationAndAudio();
        controls.update();
        renderer.render(scene, camera);
    }

    let lastTime = 0;

    function animationLoop(time) {
        if (time - lastTime >= interval) {
            animate();
            lastTime = time;
        }
        requestAnimationFrame(animationLoop);
    }

    animationLoop(0);

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Call openDB before starting the application
openDB().then(() => {
    main();
});



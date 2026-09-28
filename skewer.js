import * as THREE from "three";
import { OrbitControls } from "./libs/OrbitControls.js";
import { STLLoader } from "./libs/STLLoader.js";
import { STLExporter } from "./libs/STLExporter.js";

const FACE_CONFIG = {
  top: { axis: "y", anchor: "max" },
  bottom: { axis: "y", anchor: "min" },
  left: { axis: "x", anchor: "min" },
  right: { axis: "x", anchor: "max" },
  front: { axis: "z", anchor: "max" },
  back: { axis: "z", anchor: "min" }
};
const state = { face: "bottom", amount: 100, falloff: "linear", filename: "3dbenchy_example.stl", wireframe: false };
const elements = {
  viewer: document.querySelector("#viewer"), dropZone: document.querySelector("#drop-zone"), fileInput: document.querySelector("#file-input"),
  upload: document.querySelector("#upload-button"), fileName: document.querySelector("#file-name"), triangleCount: document.querySelector("#triangle-count"),
  orientGrid: document.querySelector("#orient-grid"), faceGrid: document.querySelector("#face-grid"), amount: document.querySelector("#amount"),
  amountNumber: document.querySelector("#amount-number"), falloff: document.querySelector("#falloff"), modelSize: document.querySelector("#model-size"),
  error: document.querySelector("#viewer-error")
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111411);
scene.fog = new THREE.Fog(0x111411, 280, 700);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 3000);
camera.position.set(90, 72, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
elements.viewer.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight(0xe8f2df, 0x283129, 2.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(80, 120, 90);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xc8ff3d, 2.1);
rimLight.position.set(-100, 40, -80);
scene.add(rimLight);
const grid = new THREE.GridHelper(500, 25, 0x485147, 0x282d28);
grid.position.y = -20.01;
scene.add(grid);

const material = new THREE.MeshStandardMaterial({ color: 0xaeb8aa, roughness: 0.56, metalness: 0.04 });
let mesh;
let sourceGeometry;
let originalGeometry;
let originalBounds;
const orientation = new THREE.Matrix4();
const baseOrientation = new THREE.Matrix4();

function makeDemoGeometry() {
  return new THREE.BoxGeometry(40, 40, 40, 5, 5, 5).toNonIndexed();
}

function setGeometry(geometry, filename = "model.stl", initialOrientation = new THREE.Matrix4()) {
  if (!geometry?.attributes?.position?.count) throw new Error("This STL does not contain any triangles.");
  if (geometry.index) geometry = geometry.toNonIndexed();
  geometry.computeBoundingBox();
  geometry.center();
  geometry.computeVertexNormals();
  sourceGeometry?.dispose();
  sourceGeometry = geometry.clone();
  baseOrientation.copy(initialOrientation);
  orientation.copy(baseOrientation);
  state.filename = filename;
  elements.fileName.textContent = filename.replace(/\.stl$/i, "");
  elements.triangleCount.textContent = `${Math.floor(geometry.attributes.position.count / 3).toLocaleString()} triangles`;
  rebuildOrientedGeometry(true);
  hideError();
}

function rebuildOrientedGeometry(refit = false) {
  const geometry = sourceGeometry.clone().applyMatrix4(orientation);
  geometry.computeBoundingBox();
  geometry.center();
  geometry.computeVertexNormals();
  originalGeometry?.dispose();
  originalGeometry = geometry.clone();
  originalGeometry.computeBoundingBox();
  originalBounds = originalGeometry.boundingBox.clone();
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  applySkew();
  if (refit) fitView();
}

function rotateModel(axis) {
  const rotation = new THREE.Matrix4();
  const quarterTurn = Math.PI / 2;
  if (axis === "x") rotation.makeRotationX(quarterTurn);
  if (axis === "y") rotation.makeRotationY(quarterTurn);
  if (axis === "z") rotation.makeRotationZ(quarterTurn);
  orientation.premultiply(rotation);
  rebuildOrientedGeometry(true);
}

function resetOrientation() {
  orientation.copy(baseOrientation);
  rebuildOrientedGeometry(true);
}

function eased(t) {
  if (state.falloff === "ease-in") return t * t;
  if (state.falloff === "ease-out") return 1 - (1 - t) * (1 - t);
  if (state.falloff === "smooth") return t * t * (3 - 2 * t);
  return t;
}

function applySkew() {
  if (!mesh || !originalGeometry) return;
  const config = FACE_CONFIG[state.face];
  const position = mesh.geometry.attributes.position;
  const source = originalGeometry.attributes.position;
  const min = originalBounds.min[config.axis];
  const max = originalBounds.max[config.axis];
  const span = max - min || 1;
  const center = originalBounds.getCenter(new THREE.Vector3());
  for (let i = 0; i < position.count; i += 1) {
    const x = source.getX(i), y = source.getY(i), z = source.getZ(i);
    const coordinate = config.axis === "x" ? x : config.axis === "y" ? y : z;
    const linearT = config.anchor === "min" ? (coordinate - min) / span : (max - coordinate) / span;
    const scale = THREE.MathUtils.lerp(1, state.amount / 100, eased(THREE.MathUtils.clamp(linearT, 0, 1)));
    position.setXYZ(
      i,
      config.axis === "x" ? x : center.x + (x - center.x) * scale,
      config.axis === "y" ? y : center.y + (y - center.y) * scale,
      config.axis === "z" ? z : center.z + (z - center.z) * scale
    );
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
  updateMeasurements();
}

function updateMeasurements() {
  const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
  elements.modelSize.textContent = `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`;
}

function syncAmountInputs() { elements.amount.value = state.amount; elements.amountNumber.value = state.amount; }
function setAmount(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  state.amount = THREE.MathUtils.clamp(value, 5, 300);
  syncAmountInputs();
  applySkew();
}

function fitView() {
  if (!mesh) return;
  const box = new THREE.Box3().setFromObject(mesh);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  const direction = new THREE.Vector3(1, 0.72, 1).normalize();
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(direction, distance * 1.15);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  controls.update();
  grid.position.y = box.min.y - Math.max(sphere.radius * 0.015, 0.1);
}

async function loadFile(file) {
  if (!file || !file.name.toLowerCase().endsWith(".stl")) return showError("Choose a file with the .stl extension.");
  try {
    setGeometry(new STLLoader().parse(await file.arrayBuffer()), file.name);
  } catch (error) {
    console.error(error);
    showError("That STL could not be read. It may be damaged or use an unsupported format.");
  } finally { elements.fileInput.value = ""; }
}

function exportStl() {
  if (!mesh) return;
  const data = new STLExporter().parse(mesh, { binary: true });
  const url = URL.createObjectURL(new Blob([data], { type: "model/stl" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.filename.replace(/\.stl$/i, "")}-askew.stl`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showError(message) { elements.error.textContent = message; elements.error.classList.add("visible"); }
function hideError() { elements.error.classList.remove("visible"); }

elements.upload.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", event => loadFile(event.target.files[0]));
elements.orientGrid.addEventListener("click", event => {
  const button = event.target.closest("button[data-rotate]");
  if (button) rotateModel(button.dataset.rotate);
});
document.querySelector("#reset-orientation").addEventListener("click", resetOrientation);
elements.faceGrid.addEventListener("click", event => {
  const button = event.target.closest("button[data-face]");
  if (!button) return;
  state.face = button.dataset.face;
  elements.faceGrid.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
  applySkew();
});
elements.amount.addEventListener("input", event => setAmount(event.target.value));
elements.amountNumber.addEventListener("change", event => setAmount(event.target.value));
elements.falloff.addEventListener("change", event => { state.falloff = event.target.value; applySkew(); });
document.querySelector("#reset-skew").addEventListener("click", () => setAmount(100));
document.querySelector("#export-button").addEventListener("click", exportStl);
document.querySelector("#fit-view").addEventListener("click", fitView);
document.querySelector("#toggle-wireframe").addEventListener("click", event => { state.wireframe = !state.wireframe; material.wireframe = state.wireframe; event.currentTarget.classList.toggle("active", state.wireframe); });
for (const type of ["dragenter", "dragover"]) elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.add("dragging"); });
for (const type of ["dragleave", "drop"]) elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.remove("dragging"); });
elements.dropZone.addEventListener("drop", event => loadFile(event.dataTransfer.files[0]));

function resize() {
  const { clientWidth, clientHeight } = elements.viewer;
  if (!clientWidth || !clientHeight) return;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(elements.viewer);
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }

async function loadDefaultModel() {
  try {
    const response = await fetch("./3dbenchy_example.stl");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const zUpToYUp = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    setGeometry(new STLLoader().parse(await response.arrayBuffer()), "3dbenchy_example.stl", zUpToYUp);
  } catch (error) {
    console.error("Could not load the bundled Benchy; using the fallback model.", error);
    setGeometry(makeDemoGeometry(), "demo-taper.stl");
    showError("The bundled Benchy could not be loaded, so ASKEW opened its fallback model.");
  }
}

resize();
animate();
loadDefaultModel();

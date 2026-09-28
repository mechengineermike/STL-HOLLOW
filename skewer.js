import * as THREE from "three";
import { OrbitControls } from "./libs/OrbitControls.js";
import { STLLoader } from "./libs/STLLoader.js";
import { STLExporter } from "./libs/STLExporter.js";

const DEFAULT_THICKNESS = 2;
const WELD_PRECISION = 100000;
const state = {
  thickness: DEFAULT_THICKNESS,
  filename: "3dbenchy_example.stl",
  wireframe: false,
  showInner: false,
  sectionEnabled: false,
  sectionAxis: "x",
  sectionPosition: 50
};
const elements = {
  viewer: document.querySelector("#viewer"), dropZone: document.querySelector("#drop-zone"), fileInput: document.querySelector("#file-input"),
  upload: document.querySelector("#upload-button"), fileName: document.querySelector("#file-name"), triangleCount: document.querySelector("#triangle-count"),
  orientGrid: document.querySelector("#orient-grid"), thickness: document.querySelector("#thickness"), thicknessNumber: document.querySelector("#thickness-number"),
  showInner: document.querySelector("#show-inner"), sectionEnabled: document.querySelector("#section-enabled"), sectionAxisGrid: document.querySelector("#section-axis-grid"),
  sectionPosition: document.querySelector("#section-position"), sectionPositionLabel: document.querySelector("#section-position-label"),
  modelSize: document.querySelector("#model-size"), error: document.querySelector("#viewer-error")
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111411);
scene.fog = new THREE.Fog(0x111411, 280, 700);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 3000);
camera.position.set(90, 72, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;
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

const sectionPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
const material = new THREE.MeshStandardMaterial({ color: 0xaeb8aa, roughness: 0.56, metalness: 0.04, side: THREE.DoubleSide });
let mesh;
let sourceGeometry;
let originalGeometry;
let hollowGeometry;
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
  buildHollowGeometry();
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

function syncThicknessInputs() {
  elements.thickness.value = state.thickness;
  elements.thicknessNumber.value = state.thickness;
}

function setThickness(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  state.thickness = THREE.MathUtils.clamp(value, 0.1, 50);
  syncThicknessInputs();
  buildHollowGeometry();
}

function setSectionPosition(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  state.sectionPosition = THREE.MathUtils.clamp(value, 0, 100);
  elements.sectionPosition.value = state.sectionPosition;
  updateSectionPlane();
}

function setSectionAxis(axis) {
  if (!["x", "y", "z"].includes(axis)) return;
  state.sectionAxis = axis;
  elements.sectionAxisGrid.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.dataset.sectionAxis === axis));
  updateSectionPlane();
}

function updateSectionPlane() {
  material.clippingPlanes = state.sectionEnabled ? [sectionPlane] : [];
  material.needsUpdate = true;
  elements.sectionPositionLabel.textContent = `${Math.round(state.sectionPosition)}%`;
  if (!mesh?.geometry?.boundingBox) return;

  const box = mesh.geometry.boundingBox;
  const axis = state.sectionAxis;
  const min = box.min[axis];
  const max = box.max[axis];
  const position = THREE.MathUtils.lerp(min, max, state.sectionPosition / 100);
  sectionPlane.normal.set(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
  sectionPlane.constant = -position;
}

function vertexKey(x, y, z) {
  return `${Math.round(x * WELD_PRECISION)},${Math.round(y * WELD_PRECISION)},${Math.round(z * WELD_PRECISION)}`;
}

function readMeshTopology(geometry) {
  const source = geometry.attributes.position;
  const vertices = [];
  const faces = [];
  const lookup = new Map();
  const center = new THREE.Box3().setFromBufferAttribute(source).getCenter(new THREE.Vector3());
  let signedVolume = 0;

  for (let i = 0; i < source.count; i += 3) {
    const indices = [];
    for (let j = 0; j < 3; j += 1) {
      const x = source.getX(i + j), y = source.getY(i + j), z = source.getZ(i + j);
      const key = vertexKey(x, y, z);
      let index = lookup.get(key);
      if (index === undefined) {
        index = vertices.length;
        lookup.set(key, index);
        vertices.push(new THREE.Vector3(x, y, z));
      }
      indices.push(index);
    }
    const a = vertices[indices[0]], b = vertices[indices[1]], c = vertices[indices[2]];
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (normal.lengthSq() < 1e-16) continue;
    normal.normalize();
    faces.push({ indices, normal });
    signedVolume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
  }

  if (signedVolume < 0) faces.forEach(face => face.normal.negate());
  const incidentFaces = Array.from({ length: vertices.length }, () => []);
  faces.forEach((face, faceIndex) => face.indices.forEach(index => incidentFaces[index].push(faceIndex)));
  return { vertices, faces, incidentFaces, center };
}

function solveSymmetric3(matrix, vector) {
  const [a, b, c, d, e, f] = matrix;
  const [x, y, z] = vector;
  const det = a * (d * f - e * e) - b * (b * f - c * e) + c * (b * e - c * d);
  if (Math.abs(det) < 1e-10) return null;
  return new THREE.Vector3(
    ((d * f - e * e) * x + (c * e - b * f) * y + (b * e - c * d) * z) / det,
    ((c * e - b * f) * x + (a * f - c * c) * y + (b * c - a * e) * z) / det,
    ((b * e - c * d) * x + (b * c - a * e) * y + (a * d - b * b) * z) / det
  );
}

function projectToOffsetPlanes(vertex, planes) {
  const point = vertex.clone();
  for (let pass = 0; pass < 12; pass += 1) {
    for (const { normal, target } of planes) {
      point.addScaledVector(normal, target - normal.dot(point));
    }
  }
  return point;
}

function offsetInnerVertices(topology, thickness) {
  return topology.vertices.map((vertex, vertexIndex) => {
    const matrix = [0, 0, 0, 0, 0, 0];
    const vector = [0, 0, 0];
    const planes = [];

    for (const faceIndex of topology.incidentFaces[vertexIndex]) {
      const normal = topology.faces[faceIndex].normal;
      const target = normal.dot(vertex) - thickness;
      planes.push({ normal, target });
      matrix[0] += normal.x * normal.x;
      matrix[1] += normal.x * normal.y;
      matrix[2] += normal.x * normal.z;
      matrix[3] += normal.y * normal.y;
      matrix[4] += normal.y * normal.z;
      matrix[5] += normal.z * normal.z;
      vector[0] += normal.x * target;
      vector[1] += normal.y * target;
      vector[2] += normal.z * target;
    }

    const solved = solveSymmetric3(matrix, vector);
    if (solved) return solved;
    if (planes.length) return projectToOffsetPlanes(vertex, planes);
    return vertex.clone().lerp(topology.center, thickness / Math.max(vertex.distanceTo(topology.center), thickness));
  });
}

function buildShellGeometry(outerGeometry, thickness, showInnerOnly = false) {
  const topology = readMeshTopology(outerGeometry);
  const innerVertices = offsetInnerVertices(topology, thickness);
  const values = [];

  for (const face of topology.faces) {
    const [a, b, c] = face.indices;
    if (!showInnerOnly) {
      values.push(...topology.vertices[a].toArray(), ...topology.vertices[b].toArray(), ...topology.vertices[c].toArray());
    }
    values.push(...innerVertices[c].toArray(), ...innerVertices[b].toArray(), ...innerVertices[a].toArray());
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildHollowGeometry() {
  if (!originalGeometry) return;
  const nextGeometry = buildShellGeometry(originalGeometry, state.thickness, state.showInner);
  hollowGeometry?.dispose();
  hollowGeometry = nextGeometry;
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
  }
  mesh = new THREE.Mesh(hollowGeometry, material);
  scene.add(mesh);
  updateMeasurements();
  updateSectionPlane();
}

function updateMeasurements() {
  if (!mesh?.geometry?.boundingBox) return;
  const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
  elements.modelSize.textContent = `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`;
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
  const exportGeometry = state.showInner ? buildShellGeometry(originalGeometry, state.thickness, false) : hollowGeometry;
  const exportMesh = state.showInner ? new THREE.Mesh(exportGeometry, material) : mesh;
  const data = new STLExporter().parse(exportMesh, { binary: true });
  if (state.showInner) exportGeometry.dispose();
  const url = URL.createObjectURL(new Blob([data], { type: "model/stl" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.filename.replace(/\.stl$/i, "")}-hollow.stl`;
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
elements.thickness.addEventListener("input", event => setThickness(event.target.value));
elements.thicknessNumber.addEventListener("change", event => setThickness(event.target.value));
elements.showInner.addEventListener("change", event => { state.showInner = event.target.checked; buildHollowGeometry(); });
elements.sectionEnabled.addEventListener("change", event => { state.sectionEnabled = event.target.checked; updateSectionPlane(); });
elements.sectionAxisGrid.addEventListener("click", event => {
  const button = event.target.closest("button[data-section-axis]");
  if (button) setSectionAxis(button.dataset.sectionAxis);
});
elements.sectionPosition.addEventListener("input", event => setSectionPosition(event.target.value));
document.querySelector("#reset-hollow").addEventListener("click", () => setThickness(DEFAULT_THICKNESS));
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
    setGeometry(makeDemoGeometry(), "demo-hollow.stl");
    showError("The bundled Benchy could not be loaded, so STL HOLLOW opened its fallback model.");
  }
}

syncThicknessInputs();
resize();
animate();
loadDefaultModel();

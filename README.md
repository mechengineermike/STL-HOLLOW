# STL HOLLOW

STL HOLLOW is a simple browser-based STL hollowing tool. Load an STL, orient it as needed, choose a wall thickness, preview the hollowed shell, and export the result as an STL. Processing stays in the browser.

## How the hollowing works

STL files are triangle surfaces, so the tool builds a second inward surface and exports both surfaces together:

1. Duplicate STL vertices are welded into a mesh topology.
2. Each triangle contributes an inward offset plane at the selected wall thickness.
3. Each inner vertex is solved from its neighboring offset planes.
4. The original outer triangles and reversed inner triangles are exported as one STL.

This gives consistent wall thickness across flat regions and sharp corners more reliably than simply moving vertices along averaged normals. Very thin sections, non-watertight meshes, self-intersecting models, or a wall thickness larger than the local feature size can still create invalid or intersecting inner surfaces.

STL files do not store units; STL HOLLOW displays dimensions as millimeters because that is the common convention in 3D-printing workflows.

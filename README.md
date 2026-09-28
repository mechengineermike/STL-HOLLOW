Use this tool at: https://mechengineermike.github.io/STL-ASKEW/

# STL ASKEW

This is a simple browser-based asymmetric STL scaling tool. Load an STL, orient it & anchor one face, resize the opposite face, and export the result as an STL. Processing stays in the browser.

## How the transform works

The selected face is the fixed plane and remains at 100% of its original size. Each cross-section is scaled in the two axes parallel to that face, reaching the selected percentage at the opposite side. Linear, ease-in, ease-out, and smooth transitions change how the scaling is distributed through the part.

Model orientation is part of the exported geometry. Rotate around X, Y, or Z before choosing an anchor face; **Reset orientation** returns to the pose stored in the uploaded STL.

STL files do not store units; ASKEW displays dimensions as millimeters because that is the common convention in 3D-printing workflows.

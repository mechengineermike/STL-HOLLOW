import trimesh
import numpy as np

def hollow_out_stl(input_path, output_path, wall_thickness):
    # Load the STL file as a Trimesh object
    mesh = trimesh.load(input_path)

    # Ensure the mesh is watertight (necessary for boolean operations)
    if not mesh.is_watertight:
        print("Input mesh is not watertight! Boolean operations may fail.")
        return

    # Offset the mesh inward by the wall thickness
    # This creates the "inner shell" of the object
    inner_shell = mesh.copy()
    inner_shell.vertices -= wall_thickness * mesh.vertex_normals

    # Create a hollow version using boolean subtraction
    hollow_mesh = mesh.difference(inner_shell)

    # Save the result to a new STL file
    hollow_mesh.export(output_path)
    print(f"Hollow STL saved to: {output_path}")


# Paths
stlpath = "H:\CAD\Pipe-Support2.STL"
output_path = "C:/Users/mgraham/Downloads/cornerProtector2.STL"

# Hollow out the STL file with a 3mm wall thickness
hollow_out_stl(stlpath, output_path, wall_thickness=3.0)




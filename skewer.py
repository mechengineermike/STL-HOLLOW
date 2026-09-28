from stl import mesh
import numpy as np
import tkinter as tk
from tkinter import filedialog

# Function to open a file dialog to select a file
def select_file(title, filetypes):
    root = tk.Tk()
    root.withdraw()  # Hide the main tkinter window
    filepath = filedialog.askopenfilename(title=title, filetypes=filetypes)
    return filepath

# Select the input STL file
stlpath = select_file("Select an STL file", [("STL files", "*.stl")])
if not stlpath:
    print("No file selected. Exiting...")
    exit()

your_mesh = mesh.Mesh.from_file(stlpath)

min_z = np.min(your_mesh.z)
max_z = np.max(your_mesh.z)
height = max_z - min_z

# Suppose alpha=2.0 means top is expanded to 2x
alpha = 2.0

for i in range(len(your_mesh.points)):
    # Each triangle has 9 values: x1,y1,z1, x2,y2,z2, x3,y3,z3
    for v in range(3):  # each triangle has 3 vertices
        z = your_mesh.points[i][3*v+2]
        t = (z - min_z) / height
        scaleFactor = 1.0 + t*(alpha - 1.0)

        x = your_mesh.points[i][3*v+0]
        y = your_mesh.points[i][3*v+1]

        your_mesh.points[i][3*v+0] = x * scaleFactor
        your_mesh.points[i][3*v+1] = y * scaleFactor
        # z stays the same (unless you want to shift it)

# Select output file path
output_path = filedialog.asksaveasfilename(
    title="Save STL file", defaultextension=".stl", filetypes=[("STL files", "*.stl")]
)
if not output_path:
    print("No output file specified. Exiting...")
    exit()

your_mesh.save(output_path)
print('Completed! File saved at:', output_path)

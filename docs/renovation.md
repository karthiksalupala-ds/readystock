# Renovating a room

Reconstruct the demo or import a RoomPlan scan, then open **Renovate**.

1. Search the library or filter by furniture, plants, or electronics. Select a model to see its 3D preview and dimensions in metres.
2. Leave **Base height** at zero for floor placement. For a laptop or monitor on a desk, enter the desk's surface height.
3. Press **Add**. The app finds an available position inside the room using the model's real-world dimensions. If it cannot fit, it explains why. Rugs can sit underneath furniture.
4. Drag furniture in the room to reposition it. Select an item in the room or the **Selected in room** menu, then use **Rotate 90°**, **Appearance**, or **Remove**. Appearance can tint a library model; **Restore model colors** returns its authored colors.
5. **Undo** reverses the last add or removal, including removal of furniture from the original scan. Up to 30 actions are retained. Movement, rotation, and appearance changes are not part of this undo history.

The library includes 26 GLBs from `models/`, with their authored materials and geometry. Doors, windows, and room structure remain fixed. Added furniture is included in the scene list and spatial assistant's current layout.

Initial placement checks available space. Manual dragging and rotation allow overlap so you can experiment with layouts. Tabletop items have a manually specified height and do not move automatically with a supporting table.

Changes last for the current page session. Refreshing or importing another scan resets the layout. If a model fails to load, use its retry button.

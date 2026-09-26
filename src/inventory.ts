export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  count: number;
  rop: number;
  status: 'CRITICAL' | 'WARNING' | 'HEALTHY';
  position: [number, number, number]; // [x, y, z] for 3D/Wireframe
  salesVelocity: number; // units per day
  daysLeft: number;
}

export const initialInventoryData: InventoryItem[] = [
  { id: 'item-1', name: 'Whole Milk (1L)', category: 'Dairy', count: 3, rop: 12, status: 'CRITICAL', position: [-1.5, 0.5, 0], salesVelocity: 18, daysLeft: 0.2 },
  { id: 'item-2', name: 'Arabica Coffee Beans (1kg)', category: 'Beans', count: 2, rop: 5, status: 'WARNING', position: [0, 1.2, -1], salesVelocity: 2.5, daysLeft: 0.8 },
  { id: 'item-3', name: 'Vanilla Syrup (750ml)', category: 'Syrups', count: 8, rop: 3, status: 'HEALTHY', position: [1.2, 0.8, 0.5], salesVelocity: 1.2, daysLeft: 6.6 },
  { id: 'item-4', name: 'Paper Cups 12oz', category: 'Packaging', count: 140, rop: 50, status: 'HEALTHY', position: [2, 0.2, 1.5], salesVelocity: 45, daysLeft: 3.1 },
  { id: 'item-5', name: 'Croissants (Pack)', category: 'Bakery', count: 4, rop: 10, status: 'CRITICAL', position: [-0.8, 0.4, 1.2], salesVelocity: 12, daysLeft: 0.3 },
  { id: 'item-6', name: 'Caramel Drizzle', category: 'Syrups', count: 1, rop: 4, status: 'WARNING', position: [1.5, 0.8, -0.5], salesVelocity: 1.5, daysLeft: 0.6 },
];

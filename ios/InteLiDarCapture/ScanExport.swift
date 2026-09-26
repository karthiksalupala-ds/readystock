import Foundation
import RoomPlan
import simd

/// One wall's extent and pose, decoupled from RoomPlan so the geometry is testable.
typealias PlacedSurface = (dimensions: SIMD3<Float>, transform: simd_float4x4)

struct ScanExport: Encodable {
    let format = "intelidar.roomplan"
    let version = 1
    let source = "roomplan"
    let room: ExportRoom
    let objects: [ExportObject]

    init(room captured: CapturedRoom) throws {
        guard !captured.walls.isEmpty else { throw ExportError.noWalls }
        let namespace = "rp:\(UUID().uuidString.lowercased())"

        // RoomPlan reports geometry in the AR session's world frame, whose heading is
        // wherever the phone happened to point at Start scan — not the room's walls.
        // Square the room up first, or the enclosing box is the bounding box of a
        // rotated rectangle: a 5 x 4 m room scanned 45° off axis exports as 6.4 x 6.4 m,
        // with every piece of furniture sitting diagonally inside it.
        let align = Self.squareUp(captured.walls.map { ($0.dimensions, $0.transform) })

        var minimum = SIMD3<Float>(repeating: .greatestFiniteMagnitude)
        var maximum = SIMD3<Float>(repeating: -.greatestFiniteMagnitude)
        var floor = Float.greatestFiniteMagnitude

        func include(_ dimensions: SIMD3<Float>, _ transform: simd_float4x4, isWall: Bool = false) {
            let placed = align * transform
            for x in [Float(-0.5), Float(0.5)] {
                for y in [Float(-0.5), Float(0.5)] {
                    for z in [Float(-0.5), Float(0.5)] {
                        let p = placed * SIMD4<Float>(dimensions.x * x, dimensions.y * y, dimensions.z * z, 1)
                        let point = SIMD3<Float>(p.x, p.y, p.z)
                        minimum = simd_min(minimum, point)
                        maximum = simd_max(maximum, point)
                        // Walls run floor to ceiling, so they locate the floor far more
                        // reliably than furniture, which the overall minimum would follow.
                        if isWall { floor = min(floor, point.y) }
                    }
                }
            }
        }

        for wall in captured.walls { include(wall.dimensions, wall.transform, isWall: true) }
        for item in captured.objects { include(item.dimensions, item.transform) }
        for surface in captured.doors { include(surface.dimensions, surface.transform) }
        for surface in captured.windows { include(surface.dimensions, surface.transform) }

        let extent = SIMD3<Float>(maximum.x - minimum.x, maximum.y - floor, maximum.z - minimum.z)
        guard [extent.x, extent.y, extent.z].allSatisfy({ $0.isFinite && $0 > 0 && $0 <= 50 }) else {
            throw ExportError.invalidBounds
        }
        let origin = SIMD3<Float>((minimum.x + maximum.x) / 2, floor, (minimum.z + maximum.z) / 2)
        room = ExportRoom(id: namespace, name: "Captured room", width: extent.x, depth: extent.z, height: extent.y)

        var result: [ExportObject] = captured.objects.map { item in
            let style = Self.style(item.category)
            return ExportObject(id: "\(namespace):\(item.identifier.uuidString.lowercased())", type: style.type,
                                label: style.label, category: style.category, dimensions: item.dimensions,
                                transform: align * item.transform, origin: origin, material: style.material, color: style.color)
        }
        // Doors and windows are separate arrays; walking each one keeps the kind known
        // without searching the other for every surface.
        for (surfaces, isWindow) in [(captured.doors, false), (captured.windows, true)] {
            result += surfaces.map { surface in
                ExportObject(id: "\(namespace):\(surface.identifier.uuidString.lowercased())",
                             type: isWindow ? "window" : "door", label: isWindow ? "Window" : "Door", category: "opening",
                             dimensions: surface.dimensions, transform: align * surface.transform, origin: origin,
                             material: isWindow ? "glass" : "wood", color: isWindow ? "#7ec8e3" : "#805a3c")
            }
        }
        guard result.count <= 500 else { throw ExportError.tooManyObjects }
        objects = result
    }

    /// The yaw that turns RoomPlan's world frame onto the room's own walls.
    ///
    /// Walls in a rectangular room lie on two perpendicular families, so their headings
    /// only agree modulo 90°. Taking the circular mean of 4θ folds those four directions
    /// onto one before averaging, and weighting by wall width lets the long walls decide
    /// rather than a short return off a nook. A room already square to the world yields
    /// ~0 and the rotation is a no-op; a room whose nearest alignment transposes width
    /// and depth is still square, which is what the enclosing box needs.
    static func squareUp(_ walls: [PlacedSurface]) -> simd_float4x4 {
        var total = SIMD2<Float>(repeating: 0)
        for wall in walls {
            // The wall's own width axis, in world space.
            let run = wall.transform.columns.0
            let horizontal = SIMD2<Float>(run.x, run.z)
            guard simd_length(horizontal) > 1e-6 else { continue }
            let heading = atan2(horizontal.y, horizontal.x)
            total += wall.dimensions.x * SIMD2<Float>(cos(4 * heading), sin(4 * heading))
        }
        guard simd_length(total) > 1e-6 else { return matrix_identity_float4x4 }
        return simd_float4x4(simd_quatf(angle: atan2(total.y, total.x) / 4, axis: SIMD3<Float>(0, 1, 0)))
    }

    private static func style(_ category: CapturedRoom.Object.Category) -> (type: String, label: String, category: String, material: String, color: String) {
        switch category {
        case .chair: return ("chair", "Chair", "furniture", "fabric", "#467568")
        case .table: return ("table", "Table", "furniture", "wood", "#b88753")
        case .storage: return ("shelf", "Storage", "furniture", "wood", "#a58a68")
        case .television: return ("monitor", "Television", "equipment", "plastic", "#262b32")
        case .sofa: return ("sofa", "Sofa", "furniture", "fabric", "#7086a3")
        case .bed: return ("bed", "Bed", "furniture", "fabric", "#ded5c4")
        case .stairs: return ("stairs", "Stairs", "structure", "wood", "#a58a68")
        default:
            let name = String(describing: category)
            return (name, humanised(name), "equipment", "plastic", "#c7cbcc")
        }
    }

    /// `washerDryer` reads as "Washer Dryer", not `.capitalized`'s "Washerdryer".
    static func humanised(_ name: String) -> String {
        var spaced = ""
        for character in name {
            if character.isUppercase && !spaced.isEmpty { spaced.append(" ") }
            spaced.append(character)
        }
        return spaced.prefix(1).uppercased() + spaced.dropFirst()
    }
}

/// Metres to the millimetre.
///
/// `Float` is binary32 and `JSONEncoder` widens it to `Double` before writing, so an
/// unrounded 5.2 reaches the viewer as 5.199999809265137 — and the HUD prints room size
/// straight from the graph, so that is exactly what a presenter would see on screen.
func millimetres(_ value: Float) -> Double {
    (Double(value) * 1000).rounded() / 1000
}

/// Radians to the microradian, for the same reason. Far finer than a scan can resolve.
func microradians(_ value: Float) -> Double {
    (Double(value) * 1_000_000).rounded() / 1_000_000
}

struct ExportRoom: Encodable {
    let id: String
    let name: String
    let width: Double
    let depth: Double
    let height: Double
    let units = "m"

    init(id: String, name: String, width: Float, depth: Float, height: Float) {
        self.id = id
        self.name = name
        self.width = millimetres(width)
        self.depth = millimetres(depth)
        self.height = millimetres(height)
    }
}

struct ExportObject: Encodable {
    let id: String
    let type: String
    let label: String
    let category: String
    let position: [Double]
    let size: [Double]
    let rotation: [Double]
    let material: String
    let color: String

    init(id: String, type: String, label: String, category: String, dimensions: SIMD3<Float>, transform: simd_float4x4,
         origin: SIMD3<Float>, material: String, color: String) {
        self.id = id; self.type = type; self.label = label; self.category = category
        self.material = material; self.color = color
        let p = transform.columns.3
        position = [millimetres(p.x - origin.x), millimetres(p.y - origin.y), millimetres(p.z - origin.z)]
        // RoomPlan openings have zero depth; give the rendered frame a small thickness.
        size = [millimetres(max(0.01, dimensions.x)), millimetres(max(0.01, dimensions.y)), millimetres(max(0.01, dimensions.z))]
        rotation = xyzEuler(transform).map(microradians)
    }
}

/// Same XYZ convention as THREE.Euler.setFromRotationMatrix, including its gimbal-lock branch.
func xyzEuler(_ m: simd_float4x4) -> [Float] {
    let m13 = max(-1, min(1, m.columns.2.x))
    let y = asin(m13)
    if abs(m13) < 0.9999999 {
        return [atan2(-m.columns.2.y, m.columns.2.z), y, atan2(-m.columns.1.x, m.columns.0.x)]
    }
    return [atan2(m.columns.1.z, m.columns.1.y), y, 0]
}

enum ExportError: LocalizedError {
    case noWalls, invalidBounds, tooManyObjects
    var errorDescription: String? {
        switch self {
        case .noWalls: return "No walls were captured. Scan the walls and floor before finishing."
        case .invalidBounds: return "The room bounds are incomplete or exceed 50 metres. Scan one room at a time."
        case .tooManyObjects: return "This scan exceeds 500 objects. Scan a smaller area."
        }
    }
}

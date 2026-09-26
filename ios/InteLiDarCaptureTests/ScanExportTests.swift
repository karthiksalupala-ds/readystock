import XCTest
import simd
@testable import InteLiDarCapture

final class ScanExportTests: XCTestCase {
    func testExportNormalizesOriginAndGivesPlanarOpeningThickness() throws {
        var matrix = matrix_identity_float4x4
        matrix.columns.3 = SIMD4<Float>(4, 2, -3, 1)
        let object = ExportObject(id: "rp:test", type: "window", label: "Window", category: "opening",
                                  dimensions: SIMD3<Float>(2, 1, 0), transform: matrix, origin: SIMD3<Float>(3, 0.5, -4),
                                  material: "glass", color: "#7ec8e3")
        XCTAssertEqual(object.position, [1, 1.5, 1])
        XCTAssertEqual(object.size, [2, 1, 0.01])
        XCTAssertEqual(object.rotation, [0, 0, 0])
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(object)) as? [String: Any])
        XCTAssertEqual(json["id"] as? String, "rp:test")
        XCTAssertEqual(json["category"] as? String, "opening")
    }

    func testXYZAnglesRoundTripCompoundAndGimbalLockRotations() {
        let angles: [SIMD3<Float>] = [SIMD3(0.2, 0.6, -0.3), SIMD3(0, .pi / 2, 0), SIMD3(0.3, -.pi / 2, 0.4), SIMD3(0, .pi, 0)]
        for angles in angles {
            let original = rotationMatrix(angles)
            let euler = xyzEuler(original)
            let result = rotationMatrix(SIMD3(euler[0], euler[1], euler[2]))
            for column in 0..<3 {
                for row in 0..<3 { XCTAssertEqual(result[column][row], original[column][row], accuracy: 0.0001) }
            }
        }
    }

    // MARK: - Measurements reach the viewer as measurements

    /// Float is binary32; JSONEncoder widens it to Double. Unrounded, a 5.2 m wall is
    /// written as 5.199999809265137 and the HUD prints exactly that.
    func testRoomAndObjectMeasurementsAreRoundedForTransport() throws {
        let room = ExportRoom(id: "rp:room", name: "Captured room", width: 5.2, depth: 4.1, height: 2.6)
        XCTAssertEqual(room.width, 5.2)
        XCTAssertEqual(room.depth, 4.1)
        XCTAssertEqual(room.height, 2.6)

        let json = try XCTUnwrap(String(data: JSONEncoder().encode(room), encoding: .utf8))
        XCTAssertFalse(json.contains("5.199999"), "raw Float precision reached the JSON: \(json)")
        XCTAssertTrue(json.contains("5.2"))

        var matrix = matrix_identity_float4x4
        matrix.columns.3 = SIMD4<Float>(1.3, 0.45, -2.7, 1)
        let object = ExportObject(id: "rp:chair", type: "chair", label: "Chair", category: "furniture",
                                  dimensions: SIMD3<Float>(0.5, 0.9, 0.5), transform: matrix,
                                  origin: SIMD3<Float>(repeating: 0), material: "fabric", color: "#467568")
        XCTAssertEqual(object.position, [1.3, 0.45, -2.7])
        XCTAssertEqual(object.size, [0.5, 0.9, 0.5])
    }

    // MARK: - Squaring the room up

    /// A room is only as square as the frame it is measured in, and RoomPlan's frame is
    /// the initial device heading. Scanned 45° off axis, an unaligned 5 x 4 m room
    /// exports as 6.4 x 6.4 m with its furniture on the diagonal.
    func testSquareUpRecoversRoomBoundsWhateverTheScanHeading() {
        for degrees in stride(from: 0, through: 170, by: 10) {
            let walls = rectangularRoom(width: 5, depth: 4, turnedBy: .pi / 180 * Float(degrees))
            let extent = bounds(of: walls, align: ScanExport.squareUp(walls))
            // Nearest alignment may transpose width and depth; either is square.
            let squared = (close(extent.x, 5.1) && close(extent.z, 4.1)) || (close(extent.x, 4.1) && close(extent.z, 5.1))
            XCTAssertTrue(squared, "\(degrees)° exported \(extent.x) x \(extent.z), expected 5.1 x 4.1 either way round")
        }
    }

    func testSquareUpIsANoOpForARoomAlreadySquareToTheWorld() {
        let walls = rectangularRoom(width: 5, depth: 4, turnedBy: 0)
        let align = ScanExport.squareUp(walls)
        for column in 0..<4 {
            for row in 0..<4 {
                XCTAssertEqual(align[column][row], matrix_identity_float4x4[column][row], accuracy: 0.0001)
            }
        }
    }

    func testSquareUpLetsTheLongWallsDecide() {
        // Two 6 m walls square to the world, one 1 m return at 20°: the return must not win.
        let walls: [PlacedSurface] = [
            wall(centre: SIMD3(0, 1.3, -2), heading: 0, width: 6),
            wall(centre: SIMD3(0, 1.3, 2), heading: 0, width: 6),
            wall(centre: SIMD3(3, 1.3, 0), heading: .pi / 180 * 20, width: 1),
        ]
        let yaw = atan2(ScanExport.squareUp(walls).columns.0.z, ScanExport.squareUp(walls).columns.0.x)
        XCTAssertLessThan(abs(yaw), .pi / 180 * 5, "a short return pulled the room \(yaw * 180 / .pi)° off square")
    }

    func testSquareUpSurvivesRoomsItCannotRead() {
        XCTAssertEqual(ScanExport.squareUp([]).columns.0.x, 1, "no walls must leave the frame alone")
        // A wall whose width axis points straight up carries no heading to average.
        var vertical = matrix_identity_float4x4
        vertical.columns.0 = SIMD4<Float>(0, 1, 0, 0)
        vertical.columns.1 = SIMD4<Float>(1, 0, 0, 0)
        XCTAssertEqual(ScanExport.squareUp([(SIMD3<Float>(2, 2.6, 0.1), vertical)]).columns.0.x, 1)
    }

    // MARK: - Labels

    func testUnmappedCategoriesReadAsWords() {
        XCTAssertEqual(ScanExport.humanised("washerDryer"), "Washer Dryer")
        XCTAssertEqual(ScanExport.humanised("refrigerator"), "Refrigerator")
        XCTAssertEqual(ScanExport.humanised(""), "")
    }

    // MARK: - Helpers

    private func close(_ value: Float, _ expected: Float) -> Bool { abs(value - expected) < 0.01 }

    private func rotationMatrix(_ angles: SIMD3<Float>) -> simd_float4x4 {
        let x = simd_float4x4(simd_quatf(angle: angles.x, axis: SIMD3(1, 0, 0)))
        let y = simd_float4x4(simd_quatf(angle: angles.y, axis: SIMD3(0, 1, 0)))
        let z = simd_float4x4(simd_quatf(angle: angles.z, axis: SIMD3(0, 0, 1)))
        return x * y * z
    }

    private func yaw(_ angle: Float) -> simd_float4x4 {
        simd_float4x4(simd_quatf(angle: angle, axis: SIMD3<Float>(0, 1, 0)))
    }

    /// A wall whose own width axis runs along `heading` in the XZ plane.
    private func wall(centre: SIMD3<Float>, heading: Float, width: Float, height: Float = 2.6) -> PlacedSurface {
        var transform = yaw(heading)
        transform.columns.3 = SIMD4<Float>(centre.x, centre.y, centre.z, 1)
        return (SIMD3<Float>(width, height, 0.1), transform)
    }

    /// Four walls of a rectangular room, the whole room turned about Y.
    private func rectangularRoom(width: Float, depth: Float, turnedBy turn: Float) -> [PlacedSurface] {
        let height: Float = 2.6
        let plan: [(SIMD3<Float>, Float, Float)] = [
            (SIMD3(0, 0, -depth / 2), 0, width),
            (SIMD3(0, 0, depth / 2), 0, width),
            (SIMD3(-width / 2, 0, 0), .pi / 2, depth),
            (SIMD3(width / 2, 0, 0), .pi / 2, depth),
        ]
        return plan.map { centre, heading, span in
            let placed = yaw(turn) * SIMD4<Float>(centre.x, 0, centre.z, 1)
            return wall(centre: SIMD3(placed.x, height / 2, placed.z), heading: heading + turn, width: span, height: height)
        }
    }

    private func bounds(of walls: [PlacedSurface], align: simd_float4x4) -> SIMD3<Float> {
        var minimum = SIMD3<Float>(repeating: .greatestFiniteMagnitude)
        var maximum = SIMD3<Float>(repeating: -.greatestFiniteMagnitude)
        for wall in walls {
            let placed = align * wall.transform
            for x in [Float(-0.5), Float(0.5)] {
                for y in [Float(-0.5), Float(0.5)] {
                    for z in [Float(-0.5), Float(0.5)] {
                        let p = placed * SIMD4<Float>(wall.dimensions.x * x, wall.dimensions.y * y, wall.dimensions.z * z, 1)
                        minimum = simd_min(minimum, SIMD3(p.x, p.y, p.z))
                        maximum = simd_max(maximum, SIMD3(p.x, p.y, p.z))
                    }
                }
            }
        }
        return maximum - minimum
    }
}

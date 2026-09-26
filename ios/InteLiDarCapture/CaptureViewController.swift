import AVFoundation
import RoomPlan
import UIKit

final class CaptureViewController: UIViewController, RoomCaptureViewDelegate {
    private enum State { case idle, requesting, scanning, processing, ready }
    private var state: State = .idle { didSet { updateControls() } }
    private let status = UILabel()
    private let preview = UIView()
    private let start = UIButton(type: .system)
    private let finish = UIButton(type: .system)
    private let export = UIButton(type: .system)
    private var captureView: RoomCaptureView?
    private var scan: ScanExport?
    private let supported = UIDevice.current.userInterfaceIdiom == .phone && RoomCaptureSession.isSupported

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = .dark
        view.backgroundColor = UIColor(red: 0.025, green: 0.04, blue: 0.055, alpha: 1)
        let heading = UILabel()
        heading.text = "InteLiDar Capture"
        heading.font = .preferredFont(forTextStyle: .largeTitle)
        heading.adjustsFontForContentSizeCategory = true
        heading.numberOfLines = 0
        status.font = .preferredFont(forTextStyle: .body)
        status.adjustsFontForContentSizeCategory = true
        status.numberOfLines = 0
        status.text = supported
            ? "Scan one room. Move slowly and include the walls, floor, doors, and furniture."
            : "This app requires an iPhone with a LiDAR scanner. Scanning is unavailable on this device."
        preview.backgroundColor = .secondarySystemBackground
        preview.layer.cornerRadius = 18
        preview.clipsToBounds = true
        configure(start, title: "Start scan", action: #selector(startScan))
        configure(finish, title: "Finish", action: #selector(finishScan))
        configure(export, title: "Export scan", action: #selector(exportScan))
        let buttons = UIStackView(arrangedSubviews: [start, finish, export])
        buttons.axis = .vertical
        buttons.spacing = 8
        let stack = UIStackView(arrangedSubviews: [heading, status, preview, buttons])
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            preview.heightAnchor.constraint(greaterThanOrEqualToConstant: 100),
        ])
        updateControls()
        // Background, not resign-active: a notification banner, Control Center, or the
        // app switcher all resign active, and ending the scan there is unrecoverable.
        NotificationCenter.default.addObserver(self, selector: #selector(finishIfBackgrounded), name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    private func configure(_ button: UIButton, title: String, action: Selector) {
        var configuration = UIButton.Configuration.filled()
        configuration.title = title
        configuration.baseBackgroundColor = UIColor(red: 0.15, green: 0.55, blue: 0.47, alpha: 1)
        configuration.cornerStyle = .medium
        button.configuration = configuration
        button.addTarget(self, action: action, for: .touchUpInside)
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    }

    private func updateControls() {
        start.isEnabled = supported && (state == .idle || state == .ready)
        finish.isEnabled = state == .scanning
        export.isEnabled = state == .ready && scan != nil
        UIApplication.shared.isIdleTimerDisabled = state == .scanning
    }

    @objc private func startScan() {
        guard supported, state == .idle || state == .ready else { return }
        if scan != nil {
            let alert = UIAlertController(title: "Start a new scan?", message: "Export the current scan first if you want to keep it.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
            alert.addAction(UIAlertAction(title: "New scan", style: .destructive) { [weak self] _ in self?.requestCamera() })
            present(alert, animated: true)
        } else { requestCamera() }
    }

    private func requestCamera() {
        state = .requesting
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: beginCapture()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    if granted { self?.beginCapture() } else { self?.cameraDenied() }
                }
            }
        default: cameraDenied()
        }
    }

    private func cameraDenied() {
        state = scan == nil ? .idle : .ready
        status.text = "Camera access is required for RoomPlan. Enable Camera in Settings, then start again."
        let alert = UIAlertController(title: "Camera access needed", message: status.text, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Settings", style: .default) { _ in
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        })
        present(alert, animated: true)
    }

    private func beginCapture() {
        guard supported else { return }
        scan = nil
        captureView?.removeFromSuperview()
        let capture = RoomCaptureView(frame: preview.bounds)
        capture.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        capture.delegate = self
        preview.addSubview(capture)
        captureView = capture
        state = .scanning
        status.text = "LiDAR scanning. Follow the on-screen guidance, then tap Finish."
        capture.captureSession.run(configuration: RoomCaptureSession.Configuration())
    }

    @objc private func finishScan() {
        guard state == .scanning else { return }
        state = .processing
        status.text = "Processing your room…"
        captureView?.captureSession.stop()
    }

    @objc private func finishIfBackgrounded() {
        // Do not continue camera capture once the app actually loses the foreground.
        if state == .scanning { finishScan() }
    }

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        if let error {
            DispatchQueue.main.async { [weak self] in self?.failed(error) }
            return false
        }
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if let error { self.failed(error); return }
            do {
                self.scan = try ScanExport(room: processedResult)
                self.state = .ready
                self.status.text = "Room ready. Export → Save to Files, then choose Import scan in InteLiDar in Safari. This is a room model; photo textures are not captured."
            } catch { self.failed(error) }
        }
    }

    private func failed(_ error: Error) {
        scan = nil
        state = .idle
        status.text = "Scan could not finish: \(error.localizedDescription) Start a new scan to try again."
    }

    @objc private func exportScan() {
        guard let scan, state == .ready else { return }
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(scan)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(scan.room.id.replacingOccurrences(of: ":", with: "-" )).intelidar.json")
            // Protected at rest, but still readable by whatever the share sheet hands it
            // to; .completeFileProtection would lock the file the moment the phone does.
            try data.write(to: url, options: [.atomic, .completeFileProtectionUnlessOpen])
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = export
            present(sheet, animated: true)
        } catch {
            status.text = "Could not export: \(error.localizedDescription) Your scan is still available; try Export again."
        }
    }
}

import SwiftUI

@main
struct ChanZoneNativeApp: App {
  @StateObject private var timer = PomodoroTimer()
  private let calendarService = CalendarService()

  var body: some Scene {
    WindowGroup {
      ContentView(timer: timer, calendarService: calendarService)
        .frame(width: timer.isCompact ? 220 : 340, height: timer.isCompact ? 132 : 500)
        .background(WindowConfigurator(isCompact: timer.isCompact))
    }
    .windowStyle(.hiddenTitleBar)
    .windowResizability(.contentSize)

    MenuBarExtra {
      Text(timer.formattedRemaining)
        .font(.system(.body, design: .serif))

      Divider()

      Button(timer.isRunning ? "暂停" : "开始", systemImage: timer.isRunning ? "pause.fill" : "play.fill") {
        timer.toggleRunning()
      }

      Button("重置", systemImage: "arrow.counterclockwise") {
        timer.reset()
      }

      Button("跳过", systemImage: "forward.end.fill") {
        timer.skip()
      }
    } label: {
      WaveMark()
        .frame(width: 22, height: 13)
        .foregroundStyle(.primary)
    }
    .menuBarExtraStyle(.menu)
  }
}

private struct WindowConfigurator: NSViewRepresentable {
  let isCompact: Bool

  func makeNSView(context: Context) -> NSView {
    let view = NSView()
    DispatchQueue.main.async {
      configure(window: view.window)
    }
    return view
  }

  func updateNSView(_ nsView: NSView, context: Context) {
    DispatchQueue.main.async {
      configure(window: nsView.window)
    }
  }

  private func configure(window: NSWindow?) {
    guard let window else { return }
    window.isMovableByWindowBackground = true
    window.level = .floating
    window.titleVisibility = .hidden
    window.titlebarAppearsTransparent = true
    window.setContentSize(isCompact ? NSSize(width: 220, height: 132) : NSSize(width: 340, height: 500))
  }
}

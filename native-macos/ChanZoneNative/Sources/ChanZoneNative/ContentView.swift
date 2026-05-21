import AppKit
import SwiftUI

struct ContentView: View {
  @ObservedObject var timer: PomodoroTimer
  let calendarService: CalendarService
  @State private var toast: String?

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(Color(red: 0.95, green: 0.9, blue: 0.78).opacity(0.78))
        .overlay(
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(.white.opacity(0.35), lineWidth: 1)
        )

      VStack(spacing: timer.isCompact ? 0 : 10) {
        titleBar

        if timer.isCompact {
          compactTimer
        } else {
          fullTimer
        }
      }
      .padding(timer.isCompact ? 10 : 16)

      if let toast {
        VStack {
          Spacer()
          Text(toast)
            .font(.caption)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(.black.opacity(0.72), in: Capsule())
            .foregroundStyle(.white)
            .padding(.bottom, 12)
        }
      }
    }
    .foregroundStyle(Color(red: 0.17, green: 0.16, blue: 0.13))
  }

  private var titleBar: some View {
    HStack {
      HStack(spacing: 7) {
        WaveMark()
          .frame(width: 24, height: 14)
          .foregroundStyle(Color(red: 0.1, green: 0.38, blue: 0.54))

        if !timer.isCompact {
          Text("Chan zone")
            .font(.system(size: 12, weight: .regular, design: .serif))
            .tracking(2)
            .foregroundStyle(Color(red: 0.1, green: 0.38, blue: 0.54).opacity(0.75))
        }
      }

      Spacer()

      Button {
        timer.toggleCompact()
      } label: {
        Image(systemName: timer.isCompact ? "arrow.up.left.and.arrow.down.right" : "arrow.down.right.and.arrow.up.left")
      }
      .buttonStyle(.plain)
      .help(timer.isCompact ? "展开窗口" : "极简模式")

      WindowActionButton(color: Color(red: 0.98, green: 0.72, blue: 0.19), help: "最小化") {
        activeWindow()?.miniaturize(nil)
      }

      WindowActionButton(color: Color(red: 1, green: 0.36, blue: 0.34), help: "关闭") {
        activeWindow()?.close()
      }
    }
  }

  private var compactTimer: some View {
    timerDial(size: 112, isCompact: true)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var fullTimer: some View {
    VStack(spacing: 12) {
      TextField("输入工作事项", text: $timer.taskTitle)
        .textFieldStyle(.plain)
        .font(.system(size: 14, design: .serif))
        .multilineTextAlignment(.center)
        .padding(.bottom, 4)
        .overlay(alignment: .bottom) {
          Rectangle()
            .fill(Color(red: 0.78, green: 0.63, blue: 0.31).opacity(0.24))
            .frame(height: 1)
        }

      Picker("模式", selection: $timer.mode) {
        ForEach(TimerMode.allCases) { mode in
          Text(mode.title).tag(mode)
        }
      }
      .pickerStyle(.segmented)
      .disabled(timer.isRunning)

      timerDial(size: 250, isCompact: false)

      HStack(spacing: 22) {
        Button {
          timer.reset()
        } label: {
          Image(systemName: "arrow.counterclockwise")
        }

        Button {
          timer.toggleRunning()
        } label: {
          Image(systemName: timer.isRunning ? "pause.fill" : "play.fill")
            .font(.title2)
        }
        .keyboardShortcut(.space, modifiers: [])

        Button {
          timer.skip()
        } label: {
          Image(systemName: "forward.end.fill")
        }
      }
      .buttonStyle(.borderless)
      .foregroundStyle(Color(red: 0.1, green: 0.38, blue: 0.54))

      Button {
        Task { await saveCurrentSession() }
      } label: {
        Label("记录此段到日历", systemImage: "calendar.badge.plus")
      }
      .buttonStyle(.bordered)
      .disabled(timer.sessionStartedAt == nil)

      Text("需要的不多，想要的太多。")
        .font(.system(size: 12, weight: .light, design: .serif))
        .tracking(1.5)
        .foregroundStyle(.secondary)
        .padding(.top, 12)

      Spacer(minLength: 12)
    }
  }

  private func timerDial(size: CGFloat, isCompact: Bool) -> some View {
    ZStack {
      Circle()
        .stroke(Color.black.opacity(0.08), lineWidth: isCompact ? 2 : 4)
        .frame(width: size * 0.72, height: size * 0.72)

      Circle()
        .trim(from: 0, to: timer.progress)
        .stroke(Color(red: 0.1, green: 0.38, blue: 0.54), style: StrokeStyle(lineWidth: isCompact ? 2 : 3, lineCap: .round))
        .rotationEffect(.degrees(-90))
        .frame(width: size * 0.72, height: size * 0.72)

      VStack(spacing: isCompact ? 2 : 6) {
        Text(timer.formattedRemaining)
          .font(.system(size: isCompact ? 36 : 46, weight: .ultraLight, design: .serif))
          .foregroundStyle(Color(red: 0.05, green: 0.25, blue: 0.38))

        if !isCompact {
          Text(timer.mode.sessionLabel)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
    }
    .frame(width: size, height: size)
  }

  private func saveCurrentSession() async {
    guard timer.calendarEnabled, let start = timer.sessionStartedAt else {
      showToast("请先开始一段计时")
      return
    }

    do {
      try await calendarService.saveSession(
        title: "专注：\(timer.taskTitle.isEmpty ? "专注工作" : timer.taskTitle)",
        start: start,
        end: Date(),
        calendarName: timer.calendarName
      )
      timer.sessionStartedAt = nil
      showToast("已记录到苹果日历")
    } catch {
      showToast("日历写入失败，请检查权限")
    }
  }

  private func showToast(_ message: String) {
    toast = message
    Task {
      try? await Task.sleep(for: .seconds(3))
      toast = nil
    }
  }
}

struct WaveMark: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    let w = rect.width
    let h = rect.height

    path.move(to: CGPoint(x: w * 0.1, y: h * 0.34))
    path.addQuadCurve(to: CGPoint(x: w * 0.48, y: h * 0.34), control: CGPoint(x: w * 0.29, y: -h * 0.1))
    path.addQuadCurve(to: CGPoint(x: w * 0.9, y: h * 0.34), control: CGPoint(x: w * 0.7, y: h * 0.78))

    path.move(to: CGPoint(x: w * 0.2, y: h * 0.72))
    path.addQuadCurve(to: CGPoint(x: w * 0.5, y: h * 0.72), control: CGPoint(x: w * 0.35, y: h * 0.35))
    path.addQuadCurve(to: CGPoint(x: w * 0.8, y: h * 0.72), control: CGPoint(x: w * 0.65, y: h * 1.05))

    return path.strokedPath(.init(lineWidth: 2, lineCap: .round, lineJoin: .round))
  }
}

private struct WindowActionButton: View {
  let color: Color
  let help: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Circle()
        .fill(color)
        .frame(width: 12, height: 12)
    }
    .buttonStyle(.plain)
    .help(help)
  }
}

@MainActor
private func activeWindow() -> NSWindow? {
  NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first
}

struct ContentView_Previews: PreviewProvider {
  static var previews: some View {
    ContentView(timer: PomodoroTimer(), calendarService: CalendarService())
      .frame(width: 340, height: 500)
  }
}

import Combine
import Foundation

enum TimerMode: String, CaseIterable, Identifiable {
  case focus
  case shortBreak
  case longBreak

  var id: String { rawValue }

  var title: String {
    switch self {
    case .focus: "专注"
    case .shortBreak: "小憩"
    case .longBreak: "长休"
    }
  }

  var sessionLabel: String {
    switch self {
    case .focus: "第 1 轮"
    case .shortBreak: "小憩中"
    case .longBreak: "深度休息"
    }
  }
}

@MainActor
final class PomodoroTimer: ObservableObject {
  @Published var mode: TimerMode = .focus
  @Published var focusMinutes = 25
  @Published var shortBreakMinutes = 5
  @Published var longBreakMinutes = 15
  @Published var taskTitle = "专注工作"
  @Published var remainingSeconds = 25 * 60
  @Published var isRunning = false
  @Published var isCompact = false
  @Published var sessionStartedAt: Date?
  @Published var calendarName = "日历"
  @Published var calendarEnabled = true

  private var tickTask: Task<Void, Never>?

  var totalSeconds: Int {
    minutes(for: mode) * 60
  }

  var formattedRemaining: String {
    let minutes = remainingSeconds / 60
    let seconds = remainingSeconds % 60
    return String(format: "%02d:%02d", minutes, seconds)
  }

  var progress: Double {
    guard totalSeconds > 0 else { return 0 }
    return 1 - (Double(remainingSeconds) / Double(totalSeconds))
  }

  func setMode(_ nextMode: TimerMode) {
    guard !isRunning else { return }
    mode = nextMode
    reset()
  }

  func toggleRunning() {
    isRunning ? pause() : start()
  }

  func start() {
    guard !isRunning else { return }
    if sessionStartedAt == nil {
      sessionStartedAt = Date()
    }
    isRunning = true
    tickTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(1))
        guard !Task.isCancelled else { return }
        await MainActor.run {
          self?.tick()
        }
      }
    }
  }

  func pause() {
    isRunning = false
    tickTask?.cancel()
    tickTask = nil
  }

  func reset() {
    pause()
    sessionStartedAt = nil
    remainingSeconds = totalSeconds
  }

  func skip() {
    pause()
    sessionStartedAt = nil
    advanceMode()
  }

  func toggleCompact() {
    isCompact.toggle()
  }

  private func tick() {
    guard remainingSeconds > 0 else {
      pause()
      advanceMode()
      return
    }

    remainingSeconds -= 1

    if remainingSeconds == 0 {
      pause()
      advanceMode()
    }
  }

  private func advanceMode() {
    switch mode {
    case .focus:
      mode = .shortBreak
    case .shortBreak, .longBreak:
      mode = .focus
    }
    remainingSeconds = totalSeconds
  }

  private func minutes(for mode: TimerMode) -> Int {
    switch mode {
    case .focus: focusMinutes
    case .shortBreak: shortBreakMinutes
    case .longBreak: longBreakMinutes
    }
  }
}

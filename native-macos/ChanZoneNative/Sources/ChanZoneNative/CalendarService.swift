import EventKit
import Foundation

@MainActor
struct CalendarService {
  private let store = EKEventStore()

  func saveSession(title: String, start: Date, end: Date, calendarName: String) async throws {
    let granted = try await store.requestFullAccessToEvents()
    guard granted else {
      throw CalendarError.accessDenied
    }

    let event = EKEvent(eventStore: store)
    event.title = title
    event.startDate = start
    event.endDate = end
    event.calendar = calendar(named: calendarName) ?? store.defaultCalendarForNewEvents
    try store.save(event, span: .thisEvent)
  }

  private func calendar(named name: String) -> EKCalendar? {
    store.calendars(for: .event).first { calendar in
      calendar.title == name
    }
  }
}

enum CalendarError: LocalizedError {
  case accessDenied

  var errorDescription: String? {
    switch self {
    case .accessDenied:
      "Calendar access was denied."
    }
  }
}

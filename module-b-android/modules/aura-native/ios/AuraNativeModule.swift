import ExpoModulesCore

public class AuraNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AuraNative")

    AsyncFunction("detectObjectsAsync") { (_: String) -> [[String: Any]] in
      return []
    }

    AsyncFunction("startForegroundServiceAsync") { (_: String, _: String) in
      return
    }

    AsyncFunction("stopForegroundServiceAsync") {
      return
    }
  }
}

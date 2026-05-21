# Chan Zone Native

这是给 Xcode 原生迁移准备的 SwiftUI 版本，目标是先把 Electron 版的核心行为拆成原生可维护的模块。

## 当前包含

- SwiftUI 桌面计时界面
- 专注 / 小憩 / 长休三种模式
- 极简模式状态，只显示计时
- EventKit 苹果日历写入服务
- 水波纹标题标识
- 第四版纸白行舟人 SVG 图标资源

## 在 Xcode 中打开

1. 打开 Xcode。
2. 选择 `File > Open...`。
3. 选择本目录：`native-macos/ChanZoneNative`。
4. 选择 `ChanZoneNative` scheme 后运行。

## 迁移到正式 Xcode App target

如果之后要做成完整 `.xcodeproj`：

1. 新建 `macOS > App`，Interface 选 `SwiftUI`。
2. 把 `Sources/ChanZoneNative` 下的 Swift 文件复制进 App target。
3. 把 `Sources/ChanZoneNative/Resources/AppIcon.svg` 放进 asset catalog 或转换成 `AppIcon.appiconset`。
4. 在 App target 的 `Info.plist` 添加：
   - `NSCalendarsFullAccessUsageDescription`
   - 值可以写：`Chan Zone needs calendar access to save completed focus sessions.`
5. 打开 Signing & Capabilities，确认沙盒策略允许日历访问；开发阶段也可以先关闭 App Sandbox 验证 EventKit 流程。

## 验证

```sh
cd native-macos/ChanZoneNative
swift build
```

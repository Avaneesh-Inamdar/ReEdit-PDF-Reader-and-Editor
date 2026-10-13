use eframe::egui::{Key, Modifiers};
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Action {
    Open,
    Save,
    SaveAs,
    Print,
    Find,
    CloseTab,
    NextTab,
    PreviousTab,
    Undo,
    Redo,
    FitPage,
    FitWidth,
    Actual,
    ZoomIn,
    ZoomOut,
    NextPage,
    PreviousPage,
    FirstPage,
    LastPage,
    FullScreen,
    Escape,
    Select,
    Hand,
    Highlight,
    Edit,
    Preferences,
    FindNext,
    FindPrevious,
    Copy,
}
pub fn shortcut(key: Key, m: Modifiers, typing: bool, single_key_tools: bool) -> Option<Action> {
    let command = m.command || m.ctrl;
    if command && !m.alt {
        return match (key, m.shift) {
            (Key::O, false) => Some(Action::Open),
            (Key::S, false) => Some(Action::Save),
            (Key::S, true) => Some(Action::SaveAs),
            (Key::P, false) => Some(Action::Print),
            (Key::F, false) => Some(Action::Find),
            (Key::W, false) | (Key::F4, false) => Some(Action::CloseTab),
            (Key::Tab, false) => Some(Action::NextTab),
            (Key::Tab, true) => Some(Action::PreviousTab),
            (Key::Z, false) if !typing => Some(Action::Undo),
            (Key::Z, true) | (Key::Y, false) if !typing => Some(Action::Redo),
            (Key::Num0, false) => Some(Action::FitPage),
            (Key::Num1, false) => Some(Action::Actual),
            (Key::Num2, false) => Some(Action::FitWidth),
            (Key::Plus, false) | (Key::Equals, false) | (Key::Plus, true) | (Key::Equals, true) => {
                Some(Action::ZoomIn)
            }
            (Key::Minus, false) => Some(Action::ZoomOut),
            (Key::Comma, false) => Some(Action::Preferences),
            (Key::C, false) if !typing => Some(Action::Copy),
            _ => None,
        };
    }
    match key {
        Key::Escape => Some(Action::Escape),
        Key::F3 => Some(if m.shift {
            Action::FindPrevious
        } else {
            Action::FindNext
        }),
        Key::F11 => Some(Action::FullScreen),
        Key::PageDown if !typing => Some(Action::NextPage),
        Key::PageUp if !typing => Some(Action::PreviousPage),
        Key::Home if !typing => Some(Action::FirstPage),
        Key::End if !typing => Some(Action::LastPage),
        Key::V if !typing && single_key_tools => Some(Action::Select),
        Key::H if !typing && single_key_tools => Some(Action::Hand),
        Key::U if !typing && single_key_tools => Some(Action::Highlight),
        _ => None,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn typing_does_not_steal_keys() {
        for key in [Key::H, Key::V, Key::U, Key::PageDown, Key::Home] {
            assert_eq!(shortcut(key, Modifiers::NONE, true, true), None);
        }
        assert_eq!(
            shortcut(Key::H, Modifiers::NONE, false, true),
            Some(Action::Hand)
        );
        assert_eq!(shortcut(Key::Z, Modifiers::CTRL, true, true), None);
        assert_eq!(
            shortcut(Key::P, Modifiers::CTRL, true, true),
            Some(Action::Print)
        );
    }
    #[test]
    fn tab_directions_and_escape() {
        assert_eq!(
            shortcut(Key::Tab, Modifiers::CTRL, false, false),
            Some(Action::NextTab)
        );
        let mut m = Modifiers::CTRL;
        m.shift = true;
        assert_eq!(
            shortcut(Key::Tab, m, false, false),
            Some(Action::PreviousTab)
        );
        assert_eq!(
            shortcut(Key::Escape, Modifiers::NONE, true, false),
            Some(Action::Escape)
        );
    }
}

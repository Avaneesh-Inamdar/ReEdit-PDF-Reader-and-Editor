//! Small vector icons with explicit geometry; no emoji or font-glyph controls.
use eframe::egui::*;
#[derive(Clone, Copy)]
pub enum Icon {
    Close,
    Open,
    Save,
    Print,
    Search,
    Previous,
    Next,
    Select,
    Hand,
    Sidebar,
    Star(bool),
}
pub fn button(ui: &mut Ui, icon: Icon, label: &str) -> Response {
    let (response, painter) = ui.allocate_painter(vec2(30., 28.), Sense::click());
    response.widget_info(|| WidgetInfo::labeled(WidgetType::Button, true, label));
    if response.hovered() {
        painter.rect_filled(response.rect, 3., ui.visuals().widgets.hovered.bg_fill);
    }
    let c = response.rect.center();
    let s = Stroke::new(1.5_f32, ui.visuals().text_color());
    let line = |a: [f32; 2], b: [f32; 2]| {
        painter.line_segment([c + vec2(a[0], a[1]), c + vec2(b[0], b[1])], s);
    };
    match icon {
        Icon::Close => {
            line([-4., -4.], [4., 4.]);
            line([4., -4.], [-4., 4.]);
        }
        Icon::Previous => {
            line([2., -5.], [-3., 0.]);
            line([-3., 0.], [2., 5.]);
        }
        Icon::Next => {
            line([-2., -5.], [3., 0.]);
            line([3., 0.], [-2., 5.]);
        }
        Icon::Search => {
            painter.circle_stroke(c - vec2(2., 2.), 5., s);
            line([2., 2.], [7., 7.]);
        }
        Icon::Open => {
            for (a, b) in [
                ([-7., -3.], [-7., 6.]),
                ([-7., 6.], [7., 6.]),
                ([7., 6.], [9., -3.]),
                ([9., -3.], [-5., -3.]),
                ([-7., -3.], [-7., -6.]),
                ([-7., -6.], [-1., -6.]),
                ([-1., -6.], [1., -3.]),
            ] {
                line(a, b);
            }
        }
        Icon::Save => {
            painter.rect_stroke(
                Rect::from_center_size(c, vec2(14., 15.)),
                1.,
                s,
                StrokeKind::Inside,
            );
            painter.rect_stroke(
                Rect::from_center_size(c + vec2(0., 3.), vec2(8., 7.)),
                0.,
                s,
                StrokeKind::Inside,
            );
            line([-4., -7.], [-4., -2.]);
            line([-4., -2.], [4., -2.]);
        }
        Icon::Print => {
            painter.rect_stroke(
                Rect::from_center_size(c, vec2(16., 9.)),
                2.,
                s,
                StrokeKind::Inside,
            );
            painter.rect_stroke(
                Rect::from_center_size(c - vec2(0., 5.), vec2(10., 6.)),
                0.,
                s,
                StrokeKind::Inside,
            );
            painter.rect_filled(
                Rect::from_center_size(c + vec2(0., 5.), vec2(10., 7.)),
                0.,
                ui.visuals().panel_fill,
            );
            painter.rect_stroke(
                Rect::from_center_size(c + vec2(0., 5.), vec2(10., 7.)),
                0.,
                s,
                StrokeKind::Inside,
            );
        }
        Icon::Sidebar => {
            painter.rect_stroke(
                Rect::from_center_size(c, vec2(16., 14.)),
                1.,
                s,
                StrokeKind::Inside,
            );
            line([-3., -7.], [-3., 7.]);
        }
        Icon::Select => {
            painter.add(Shape::closed_line(
                vec![
                    c + vec2(-5., -7.),
                    c + vec2(5., 2.),
                    c + vec2(0., 3.),
                    c + vec2(-2., 8.),
                    c + vec2(-5., -7.),
                ],
                s,
            ));
        }
        Icon::Hand => {
            painter.add(Shape::closed_line(
                vec![
                    c + vec2(-5., 1.),
                    c + vec2(-5., -5.),
                    c + vec2(-2., -5.),
                    c + vec2(-2., -8.),
                    c + vec2(1., -8.),
                    c + vec2(1., -5.),
                    c + vec2(4., -5.),
                    c + vec2(4., -2.),
                    c + vec2(7., -2.),
                    c + vec2(5., 7.),
                    c + vec2(-1., 7.),
                    c + vec2(-7., 1.),
                ],
                s,
            ));
        }
        Icon::Star(filled) => {
            let points = (0..10)
                .map(|i| {
                    let a = std::f32::consts::TAU * i as f32 / 10. - std::f32::consts::FRAC_PI_2;
                    let r = if i % 2 == 0 { 8. } else { 3.5 };
                    c + vec2(a.cos() * r, a.sin() * r)
                })
                .collect();
            if filled {
                painter.add(Shape::convex_polygon(
                    points,
                    Color32::from_rgb(185, 130, 20),
                    s,
                ));
            } else {
                painter.add(Shape::closed_line(points, s));
            }
        }
    }
    response
        .on_hover_text(label)
        .on_hover_cursor(CursorIcon::PointingHand)
}

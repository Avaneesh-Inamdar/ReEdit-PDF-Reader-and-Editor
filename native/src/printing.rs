//! One print plan drives both preview and platform output. Coordinates are PDF
//! points (72 per inch), independent of monitor DPI or printer resolution.
use anyhow::{Result, bail, ensure};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Box2 {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Scale {
    Fit,
    Actual,
    Shrink,
    Custom(f32),
}
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Handling {
    Size,
    Multiple { columns: usize, rows: usize },
    Booklet,
    Poster { percent: f32, overlap: f32 },
}
#[derive(Debug, Default, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum PageOrder {
    #[default]
    Horizontal,
    HorizontalReversed,
    Vertical,
    VerticalReversed,
}
#[derive(Debug, Default, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Binding {
    #[default]
    Left,
    Right,
}
#[derive(Debug, Default, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum BookletSubset {
    #[default]
    Both,
    Front,
    Back,
}
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Duplex {
    Off,
    LongEdge,
    ShortEdge,
}
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Parity {
    All,
    Odd,
    Even,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintOptions {
    pub printer: String,
    pub copies: usize,
    pub collate: bool,
    pub color: bool,
    pub duplex: Duplex,
    pub paper: [f32; 2],
    #[serde(default)]
    pub original_paper: bool,
    pub landscape: bool,
    pub scale: Scale,
    pub handling: Handling,
    #[serde(default)]
    pub page_order: PageOrder,
    #[serde(default)]
    pub print_page_border: bool,
    #[serde(default)]
    pub booklet_binding: Binding,
    #[serde(default)]
    pub booklet_subset: BookletSubset,
    pub range: String,
    pub parity: Parity,
    pub reverse: bool,
    pub auto_rotate: bool,
    pub print_annotations: bool,
    pub margin: f32,
}
impl Default for PrintOptions {
    fn default() -> Self {
        Self {
            printer: String::new(),
            copies: 1,
            collate: true,
            color: true,
            duplex: Duplex::Off,
            paper: [595.276, 841.89],
            original_paper: false,
            landscape: false,
            scale: Scale::Fit,
            handling: Handling::Size,
            page_order: PageOrder::Horizontal,
            print_page_border: false,
            booklet_binding: Binding::Left,
            booklet_subset: BookletSubset::Both,
            range: String::new(),
            parity: Parity::All,
            reverse: false,
            auto_rotate: true,
            print_annotations: true,
            margin: 18.0,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Placement {
    pub page: usize,
    pub target: Box2,
    pub clip: Box2,
    pub rotate: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sheet {
    pub size: [f32; 2],
    pub placements: Vec<Placement>,
}

pub fn page_range(range: &str, count: usize) -> Result<Vec<usize>> {
    ensure!(count > 0, "The document has no pages");
    if range.trim().is_empty() {
        return Ok((0..count).collect());
    }
    let mut pages = Vec::new();
    for item in range.split(',') {
        let pieces: Vec<_> = item.trim().split('-').collect();
        ensure!(
            pieces.len() <= 2 && !pieces[0].is_empty(),
            "Use pages such as 1-3, 5, 8"
        );
        let a: usize = pieces[0].trim().parse()?;
        let b: usize = if pieces.len() == 2 {
            pieces[1].trim().parse()?
        } else {
            a
        };
        ensure!(
            a > 0 && b > 0 && a <= count && b <= count,
            "Page is outside this document"
        );
        let iter: Box<dyn Iterator<Item = usize>> = if a <= b {
            Box::new(a..=b)
        } else {
            Box::new((b..=a).rev())
        };
        for p in iter {
            if !pages.contains(&(p - 1)) {
                pages.push(p - 1);
            }
        }
    }
    ensure!(!pages.is_empty(), "Choose at least one page");
    Ok(pages)
}
fn placement(page: usize, size: [f32; 2], cell: Box2, options: &PrintOptions) -> Placement {
    let fit = (cell.w / size[0]).min(cell.h / size[1]);
    let rotated_fit = (cell.w / size[1]).min(cell.h / size[0]);
    let rotate = options.auto_rotate && rotated_fit > fit + 0.001;
    let [w, h] = if rotate { [size[1], size[0]] } else { size };
    let fit = (cell.w / w).min(cell.h / h);
    let k = match options.scale {
        Scale::Fit => fit,
        Scale::Actual => 1.,
        Scale::Shrink => fit.min(1.),
        Scale::Custom(p) => p / 100.,
    };
    Placement {
        page,
        target: Box2 {
            x: cell.x + (cell.w - w * k) / 2.,
            y: cell.y + (cell.h - h * k) / 2.,
            w: w * k,
            h: h * k,
        },
        clip: cell,
        rotate,
    }
}
pub fn plan(options: &PrintOptions, sizes: &[[f32; 2]]) -> Result<Vec<Sheet>> {
    ensure!(
        (1..=999).contains(&options.copies),
        "Copies must be between 1 and 999"
    );
    ensure!(
        sizes
            .iter()
            .all(|s| s.iter().all(|v| v.is_finite() && *v > 0.)),
        "Invalid page dimensions"
    );
    ensure!(
        options.paper.iter().all(|v| v.is_finite() && *v > 36.),
        "Invalid paper size"
    );
    ensure!(
        options.margin.is_finite() && options.margin >= 0.,
        "Invalid margins"
    );
    if let Scale::Custom(p) = options.scale {
        ensure!(
            p.is_finite() && (1. ..=1000.).contains(&p),
            "Scale must be 1–1000%"
        );
    }
    let size = if options.landscape {
        [options.paper[1], options.paper[0]]
    } else {
        options.paper
    };
    let cell = Box2 {
        x: options.margin,
        y: options.margin,
        w: size[0] - 2. * options.margin,
        h: size[1] - 2. * options.margin,
    };
    ensure!(
        cell.w > 0. && cell.h > 0.,
        "Margins leave no printable area"
    );
    let mut pages = page_range(&options.range, sizes.len())?;
    pages.retain(|p| match options.parity {
        Parity::All => true,
        Parity::Odd => p % 2 == 0,
        Parity::Even => p % 2 == 1,
    });
    ensure!(!pages.is_empty(), "No pages match these options");
    if options.reverse {
        pages.reverse();
    }
    let mut sheets = Vec::new();
    match options.handling {
        Handling::Size => {
            for p in pages {
                let (size, cell) = if options.original_paper {
                    let size = if options.landscape {
                        [sizes[p][1], sizes[p][0]]
                    } else {
                        sizes[p]
                    };
                    let cell = Box2 {
                        x: options.margin,
                        y: options.margin,
                        w: size[0] - 2. * options.margin,
                        h: size[1] - 2. * options.margin,
                    };
                    ensure!(
                        cell.w > 0. && cell.h > 0.,
                        "Margins leave no printable area"
                    );
                    (size, cell)
                } else {
                    (size, cell)
                };
                sheets.push(Sheet {
                    size,
                    placements: vec![placement(p, sizes[p], cell, options)],
                });
            }
        }
        Handling::Multiple { columns, rows } => {
            ensure!(
                columns > 0 && rows > 0 && columns <= 64 / rows,
                "Choose 1–64 pages per sheet"
            );
            let mut fit = options.clone();
            fit.scale = Scale::Fit;
            for group in pages.chunks(columns * rows) {
                let placements = group
                    .iter()
                    .enumerate()
                    .map(|(i, p)| {
                        let (column, row) = match options.page_order {
                            PageOrder::Horizontal => (i % columns, i / columns),
                            PageOrder::HorizontalReversed => {
                                (columns - 1 - i % columns, i / columns)
                            }
                            PageOrder::Vertical => (i / rows, i % rows),
                            PageOrder::VerticalReversed => (columns - 1 - i / rows, i % rows),
                        };
                        placement(
                            *p,
                            sizes[*p],
                            Box2 {
                                x: cell.x + column as f32 * cell.w / columns as f32,
                                y: cell.y + row as f32 * cell.h / rows as f32,
                                w: cell.w / columns as f32,
                                h: cell.h / rows as f32,
                            },
                            &fit,
                        )
                    })
                    .collect();
                sheets.push(Sheet { size, placements });
            }
        }
        Handling::Booklet => {
            let padded = pages.len().div_ceil(4) * 4;
            let mut fit = options.clone();
            fit.scale = Scale::Fit;
            for sheet in 0..padded / 4 {
                for (side, mut pair) in [
                    [padded - 1 - 2 * sheet, 2 * sheet],
                    [2 * sheet + 1, padded - 2 - 2 * sheet],
                ]
                .into_iter()
                .enumerate()
                {
                    if (options.booklet_subset == BookletSubset::Front && side == 1)
                        || (options.booklet_subset == BookletSubset::Back && side == 0)
                    {
                        continue;
                    }
                    if options.booklet_binding == Binding::Right {
                        pair.reverse();
                    }
                    let placements = pair
                        .into_iter()
                        .enumerate()
                        .filter_map(|(slot, i)| {
                            pages.get(i).map(|p| {
                                placement(
                                    *p,
                                    sizes[*p],
                                    Box2 {
                                        x: cell.x + slot as f32 * cell.w / 2.,
                                        y: cell.y,
                                        w: cell.w / 2.,
                                        h: cell.h,
                                    },
                                    &fit,
                                )
                            })
                        })
                        .collect();
                    sheets.push(Sheet { size, placements });
                }
            }
        }
        Handling::Poster { percent, overlap } => {
            ensure!(
                percent.is_finite() && (1. ..=1000.).contains(&percent),
                "Tile scale must be 1–1000%"
            );
            ensure!(
                overlap.is_finite() && overlap >= 0. && overlap < cell.w.min(cell.h) / 2.,
                "Invalid tile overlap"
            );
            for p in pages {
                let w = sizes[p][0] * percent / 100.;
                let h = sizes[p][1] * percent / 100.;
                let nx = ((w - overlap) / (cell.w - overlap)).ceil().max(1.) as usize;
                let ny = ((h - overlap) / (cell.h - overlap)).ceil().max(1.) as usize;
                ensure!(nx * ny <= 10000, "Poster would require too many sheets");
                for y in 0..ny {
                    for x in 0..nx {
                        sheets.push(Sheet {
                            size,
                            placements: vec![Placement {
                                page: p,
                                rotate: false,
                                clip: cell,
                                target: Box2 {
                                    x: cell.x - x as f32 * (cell.w - overlap),
                                    y: cell.y - y as f32 * (cell.h - overlap),
                                    w,
                                    h,
                                },
                            }],
                        });
                    }
                }
            }
        }
    }
    if sheets.is_empty() {
        bail!("Nothing to print")
    };
    Ok(sheets)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn multiple_orders_fill_the_expected_grid_slots_and_keep_partial_sheets() {
        for (order, slots) in [
            (PageOrder::Horizontal, vec![0, 1, 2, 3, 4, 5]),
            (PageOrder::HorizontalReversed, vec![1, 0, 3, 2, 5, 4]),
            (PageOrder::Vertical, vec![0, 2, 4, 1, 3, 5]),
            (PageOrder::VerticalReversed, vec![1, 3, 5, 0, 2, 4]),
        ] {
            let o = PrintOptions {
                handling: Handling::Multiple {
                    columns: 2,
                    rows: 3,
                },
                page_order: order,
                ..Default::default()
            };
            let sheets = plan(&o, &[[100., 200.]; 7]).unwrap();
            assert_eq!(sheets.len(), 2);
            let positions: Vec<_> = sheets[0]
                .placements
                .iter()
                .map(|p| {
                    let column = ((p.clip.x - o.margin) / p.clip.w).round() as usize;
                    let row = ((p.clip.y - o.margin) / p.clip.h).round() as usize;
                    row * 2 + column
                })
                .collect();
            assert_eq!(positions, slots, "{order:?}");
            assert_eq!(sheets[1].placements.len(), 1);
            assert_eq!(sheets[1].placements[0].page, 6);
            assert_eq!(
                sheets[1].placements[0].clip.x,
                sheets[0].placements[0].clip.x
            );
        }
        let o = PrintOptions {
            handling: Handling::Multiple {
                columns: usize::MAX,
                rows: usize::MAX,
            },
            ..Default::default()
        };
        assert!(plan(&o, &[[100., 200.]]).is_err());
    }

    #[test]
    fn booklet_binding_and_manual_passes_preserve_imposition_and_padding() {
        for count in 1..18 {
            for binding in [Binding::Left, Binding::Right] {
                let mut o = PrintOptions {
                    handling: Handling::Booklet,
                    booklet_binding: binding,
                    ..Default::default()
                };
                let all = plan(&o, &vec![[595., 842.]; count]).unwrap();
                let mut seen = Vec::new();
                for (subset, side) in [(BookletSubset::Front, 0), (BookletSubset::Back, 1)] {
                    o.booklet_subset = subset;
                    let pass = plan(&o, &vec![[595., 842.]; count]).unwrap();
                    assert_eq!(pass.len(), count.div_ceil(4));
                    for (index, sheet) in pass.iter().enumerate() {
                        assert_eq!(
                            serde_json::to_value(sheet).unwrap(),
                            serde_json::to_value(&all[index * 2 + side]).unwrap()
                        );
                        seen.extend(sheet.placements.iter().map(|p| p.page));
                    }
                }
                seen.sort();
                assert_eq!(seen, (0..count).collect::<Vec<_>>());
            }
        }
        let o = PrintOptions {
            handling: Handling::Booklet,
            booklet_binding: Binding::Right,
            ..Default::default()
        };
        let sheets = plan(&o, &[[595., 842.]; 8]).unwrap();
        assert_eq!(
            sheets
                .iter()
                .map(|s| s.placements.iter().map(|p| p.page + 1).collect::<Vec<_>>())
                .collect::<Vec<_>>(),
            vec![vec![1, 8], vec![7, 2], vec![3, 6], vec![5, 4]]
        );
    }
    #[test]
    fn ranges_validate_and_preserve_order() {
        assert_eq!(page_range("3-1,5,3", 5).unwrap(), vec![2, 1, 0, 4]);
        for s in ["0", "6", "1-", "1,,2", "a", "1-2-3"] {
            assert!(page_range(s, 5).is_err(), "{s}");
        }
    }
    #[test]
    fn booklet_pads_without_losing_pages() {
        let o = PrintOptions {
            handling: Handling::Booklet,
            landscape: true,
            ..Default::default()
        };
        for n in 1..65 {
            let s = plan(&o, &vec![[595., 842.]; n]).unwrap();
            let mut pages: Vec<_> = s
                .iter()
                .flat_map(|s| s.placements.iter().map(|p| p.page))
                .collect();
            pages.sort();
            assert_eq!(pages, (0..n).collect::<Vec<_>>());
            assert_eq!(s.len(), n.div_ceil(4) * 2);
        }
        let s = plan(&o, &[[595., 842.]; 8]).unwrap();
        assert_eq!(
            s.iter()
                .map(|s| s.placements.iter().map(|p| p.page + 1).collect::<Vec<_>>())
                .collect::<Vec<_>>(),
            vec![vec![8, 1], vec![2, 7], vec![6, 3], vec![4, 5]]
        );
    }
    #[test]
    fn multiple_and_poster_use_real_sheets() {
        let o = PrintOptions {
            handling: Handling::Multiple {
                columns: 2,
                rows: 2,
            },
            ..Default::default()
        };
        let s = plan(&o, &[[595., 842.]; 5]).unwrap();
        assert_eq!(s.len(), 2);
        assert_eq!(s[0].placements.len(), 4);
        let o = PrintOptions {
            handling: Handling::Poster {
                percent: 200.,
                overlap: 12.,
            },
            ..Default::default()
        };
        let s = plan(&o, &[[595., 842.]]).unwrap();
        assert!(s.len() >= 4);
    }
    #[test]
    fn original_paper_preserves_mixed_page_sizes_and_order() {
        let o = PrintOptions {
            original_paper: true,
            reverse: true,
            ..Default::default()
        };
        let sheets = plan(&o, &[[300., 400.], [612., 792.]]).unwrap();
        assert_eq!(sheets[0].size, [612., 792.]);
        assert_eq!(sheets[1].size, [300., 400.]);
        assert_eq!(sheets[0].placements[0].page, 1);
    }
    #[test]
    fn shrink_does_not_enlarge_and_parity_precedes_reverse() {
        let o = PrintOptions {
            scale: Scale::Shrink,
            auto_rotate: false,
            parity: Parity::Odd,
            reverse: true,
            ..Default::default()
        };
        let s = plan(&o, &[[100., 100.]; 5]).unwrap();
        assert_eq!(
            s.iter().map(|s| s.placements[0].page).collect::<Vec<_>>(),
            vec![4, 2, 0]
        );
        assert_eq!(s[0].placements[0].target.w, 100.);
    }
    proptest::proptest! {
        #[test] fn fit_is_bounded(w in 1f32..3000.,h in 1f32..3000.) {
            let o=PrintOptions::default();let s=plan(&o,&[[w,h]]).unwrap();let p=&s[0].placements[0];
            proptest::prop_assert!(p.target.w<=p.clip.w+0.01&&p.target.h<=p.clip.h+0.01);
            proptest::prop_assert!(p.target.x>=p.clip.x-0.01&&p.target.y>=p.clip.y-0.01);
        }
    }
}

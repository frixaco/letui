import assert from "node:assert/strict";
import test from "node:test";
import { AbstractAxis, AbsoluteAxis, AlignContent, CompactLength, CompactLengthTag, Dimension, GridAutoFlow, GridAutoTracks, GridTemplateArea, InvalidStringRepetitionValue, LengthPercentage, LengthPercentageAuto, Line, MaxTrackSizingFunction, MinTrackSizingFunction, ParseError, Style, TrackSizingFunction, TrackCounts, GridTemplateTracks, evenlySizedTracks, evenly_sized_tracks, flex, fr, gridLineAsI16, gridLineIntoOriginZeroLine, grid_line_as_i16, grid_line_into_origin_zero_line, grid_auto_flow_is_dense, grid_auto_flow_primary_axis, gridAutoFlowIsDense, gridAutoFlowPrimaryAxis, gridPlacementIntoOriginZeroIgnoringNamed, gridPlacementLine, gridPlacementLineIntoOriginZeroIgnoringNamed, gridPlacementLineIsDefinite, gridPlacementFromString, gridPlacementNamedLine, gridPlacementNamedSpan, gridPlacementSpan, grid_placement_from_string, gridTemplateComponentAsComponentRef, gridTemplateComponentAuto, gridTemplateComponentFitContent, gridTemplateComponentFr, gridTemplateComponentIsAutoRepetition, gridTemplateComponentLength, gridTemplateComponentMaxContent, gridTemplateComponentMinContent, gridTemplateComponentPercent, gridTemplateComponentSingle, gridTemplateComponentZero, gridTemplateComponentFromString, grid_template_component_as_component_ref, grid_template_component_is_auto_repetition, grid_template_component_from_string, gridAutoTracksFromString, grid_auto_tracks_from_string, gridTemplateTracksFromString, grid_template_tracks_from_string, lengthTrack, maxTrackSizingFunctionFromString, max_track_sizing_function_from_string, minmax, minTrackSizingFunctionFromString, min_track_sizing_function_from_string, nonNamedGridPlacementIntoOriginZero, nonNamedGridPlacementLineIntoOriginZero, nonNamedGridPlacementLineIsDefinite, originZeroGridPlacementLineIndefiniteSpan, originZeroGridPlacementLineIsDefinite, originZeroGridPlacementLineResolveAbsolutelyPositionedGridTracks, originZeroGridPlacementLineResolveDefiniteGridLines, originZeroGridPlacementLineResolveIndefiniteGridTracks, originZeroLineImpliedNegativeImplicitTracks, originZeroLineImpliedPositiveImplicitTracks, originZeroLineIntoTrackVecIndex, originZeroLineSpan, originZeroLineTryIntoTrackVecIndex, origin_zero_line_implied_negative_implicit_tracks, origin_zero_line_implied_positive_implicit_tracks, origin_zero_line_into_track_vec_index, origin_zero_line_span, origin_zero_line_try_into_track_vec_index, percentTrack, repeat, repetitionCountFrom, repetitionCountFromString, repetition_count_from_string, trackSizingFunctionFromString, track_sizing_function_from_string, } from "../src/index.js";
import { evenlySizedTracks as helperEvenlySizedTracks, evenly_sized_tracks as helper_evenly_sized_tracks, flex as helperFlex, fr as helperFr, line as helperLine, minmax as helperMinmax, repeat as helperRepeat, span as helperSpan, } from "../src/style/helpers.js";
test("track sizing constructors mirror Rust style helper conversions", () => {
    assert.equal(MaxTrackSizingFunction.ZERO.intoRaw().value(), 0);
    assert.equal(MaxTrackSizingFunction.AUTO.isAuto(), true);
    assert.equal(MaxTrackSizingFunction.MIN_CONTENT.isMinContent(), true);
    assert.equal(MaxTrackSizingFunction.MAX_CONTENT.isMaxContent(), true);
    assert.equal(MaxTrackSizingFunction.fromLength(12).intoRaw().value(), 12);
    assert.equal(MaxTrackSizingFunction.fromPercent(0.25).intoRaw().tag(), CompactLengthTag.Percent);
    assert.equal(MaxTrackSizingFunction.fromFr(2).intoRaw().tag(), CompactLengthTag.Fr);
    assert.equal(MaxTrackSizingFunction.from_length(12).into_raw().value(), 12);
    assert.equal(MaxTrackSizingFunction.from_percent(0.25).into_raw().tag(), CompactLengthTag.Percent);
    assert.equal(MaxTrackSizingFunction.from_fr(2).is_fr(), true);
    assert.equal(MaxTrackSizingFunction.min_content().is_min_content(), true);
    assert.equal(MaxTrackSizingFunction.max_content().is_max_content(), true);
    assert.equal(MaxTrackSizingFunction.fit_content_px(16).is_fit_content(), true);
    assert.equal(MaxTrackSizingFunction.fit_content_percent(0.5).uses_percentage(), true);
    assert.equal(MaxTrackSizingFunction.fit_content(LengthPercentage.length(8)).is_max_content_alike(), true);
    assert.equal(MaxTrackSizingFunction.from_raw(CompactLength.length(5)).into_raw().value(), 5);
    assert.notEqual(MaxTrackSizingFunction.AUTO, MaxTrackSizingFunction.AUTO);
    assert.equal(MinTrackSizingFunction.ZERO.intoRaw().value(), 0);
    assert.equal(MinTrackSizingFunction.AUTO.isAuto(), true);
    assert.equal(MinTrackSizingFunction.MIN_CONTENT.isMinContent(), true);
    assert.equal(MinTrackSizingFunction.MAX_CONTENT.isMaxContent(), true);
    assert.equal(MinTrackSizingFunction.fromLength(12).intoRaw().value(), 12);
    assert.equal(MinTrackSizingFunction.fromPercent(0.25).intoRaw().tag(), CompactLengthTag.Percent);
    assert.equal(MinTrackSizingFunction.from_length(12).into_raw().value(), 12);
    assert.equal(MinTrackSizingFunction.from_percent(0.25).into_raw().tag(), CompactLengthTag.Percent);
    assert.equal(MinTrackSizingFunction.min_content().is_min_content(), true);
    assert.equal(MinTrackSizingFunction.max_content().is_max_content(), true);
    assert.equal(MinTrackSizingFunction.from_raw(CompactLength.length(5)).into_raw().value(), 5);
    assert.equal(TrackSizingFunction.ZERO.min.intoRaw().value(), 0);
    assert.equal(TrackSizingFunction.ZERO.max.intoRaw().value(), 0);
    assert.equal(TrackSizingFunction.AUTO.min.isAuto(), true);
    assert.equal(TrackSizingFunction.AUTO.max.isAuto(), true);
    assert.equal(TrackSizingFunction.MIN_CONTENT.min.isMinContent(), true);
    assert.equal(TrackSizingFunction.MAX_CONTENT.max.isMaxContent(), true);
    assert.equal(TrackSizingFunction.fromLength(12).max.intoRaw().value(), 12);
    assert.equal(TrackSizingFunction.fromPercent(0.25).min.intoRaw().tag(), CompactLengthTag.Percent);
    assert.equal(TrackSizingFunction.fromFr(2).min.isAuto(), true);
    assert.equal(TrackSizingFunction.fromFr(2).max.intoRaw().tag(), CompactLengthTag.Fr);
    assert.equal(TrackSizingFunction.from_length(12).max_sizing_function().into_raw().value(), 12);
    assert.equal(TrackSizingFunction.from_percent(0.25).min_sizing_function().into_raw().tag(), CompactLengthTag.Percent);
    assert.equal(TrackSizingFunction.from_fr(2).max_sizing_function().is_fr(), true);
    assert.equal(TrackSizingFunction.min_content().min_sizing_function().is_min_content(), true);
    assert.equal(TrackSizingFunction.max_content().max_sizing_function().is_max_content(), true);
    assert.equal(TrackSizingFunction.fit_content(LengthPercentage.length(12))
        .max_sizing_function()
        .is_fit_content(), true);
    const length = lengthTrack(12);
    assert.equal(length.min.intoRaw().tag(), CompactLengthTag.Length);
    assert.equal(length.max.intoRaw().tag(), CompactLengthTag.Length);
    assert.equal(length.hasFixedComponent(), true);
    assert.equal(length.has_fixed_component(), true);
    const percent = percentTrack(0.5);
    assert.equal(percent.min.definiteValue(undefined), undefined);
    assert.equal(percent.min.definiteValue(200), 100);
    assert.equal(percent.max.definiteValue(200), 100);
    assert.equal(percent.min.definite_value(200), 100);
    assert.equal(percent.min.resolved_percentage_size(200), 100);
    assert.equal(percent.min.uses_percentage(), true);
    assert.equal(percent.max.has_definite_value(undefined), false);
    assert.equal(percent.max.has_definite_value(200), true);
    assert.equal(percent.max.definite_value(200), 100);
    assert.equal(percent.max.definite_limit(200), 100);
    assert.equal(percent.max.resolved_percentage_size(200), 100);
    const fraction = fr(2);
    assert.equal(fraction.min.isAuto(), true);
    assert.equal(fraction.max.isFr(), true);
    assert.equal(fraction.max.intoRaw().value(), 2);
    assert.equal(fr(3, CompactLength).tag(), CompactLengthTag.Fr);
    assert.equal(fr(4, { from_fr: CompactLength.from_fr }).tag(), CompactLengthTag.Fr);
    assert.equal(fr(3, MaxTrackSizingFunction).isFr(), true);
    assert.equal(fr(3, TrackSizingFunction).max.isFr(), true);
    assert.equal(fr(3, { fromFr: gridTemplateComponentFr }).type, "Single");
});
test("track sizing conversion helpers mirror Rust From implementations", () => {
    const lengthPercentage = LengthPercentage.percent(0.25);
    const lengthPercentageAuto = LengthPercentageAuto.auto();
    const dimension = Dimension.length(32);
    assert.equal(MaxTrackSizingFunction.fromLengthPercentage(lengthPercentage).intoRaw().tag(), CompactLengthTag.Percent);
    assert.equal(MaxTrackSizingFunction.fromLengthPercentageAuto(lengthPercentageAuto).isAuto(), true);
    assert.equal(MaxTrackSizingFunction.fromDimension(dimension).intoRaw().value(), 32);
    const min = MinTrackSizingFunction.fromLengthPercentage(LengthPercentage.length(12));
    assert.equal(min.intoRaw().tag(), CompactLengthTag.Length);
    assert.equal(MaxTrackSizingFunction.fromMin(min).intoRaw().value(), 12);
    assert.equal(MinTrackSizingFunction.fromLengthPercentageAuto(lengthPercentageAuto).isAuto(), true);
    assert.equal(MinTrackSizingFunction.fromDimension(Dimension.percent(0.5)).intoRaw().tag(), CompactLengthTag.Percent);
    const fromLengthPercentage = TrackSizingFunction.fromLengthPercentage(lengthPercentage);
    assert.equal(fromLengthPercentage.min.intoRaw().tag(), CompactLengthTag.Percent);
    assert.equal(fromLengthPercentage.max.intoRaw().tag(), CompactLengthTag.Percent);
    const fromLengthPercentageAuto = TrackSizingFunction.fromLengthPercentageAuto(lengthPercentageAuto);
    assert.equal(fromLengthPercentageAuto.min.isAuto(), true);
    assert.equal(fromLengthPercentageAuto.max.isAuto(), true);
    const fromDimension = TrackSizingFunction.fromDimension(dimension);
    assert.equal(fromDimension.min.intoRaw().value(), 32);
    assert.equal(fromDimension.max.intoRaw().value(), 32);
});
test("min track conversion from max track follows Rust fr and fit-content exceptions", () => {
    assert.equal(MinTrackSizingFunction.fromMax(MaxTrackSizingFunction.fr(1)).isAuto(), true);
    assert.equal(MinTrackSizingFunction.fromMax(MaxTrackSizingFunction.fitContent(LengthPercentage.length(20))).isAuto(), true);
    assert.equal(MinTrackSizingFunction.fromMax(MaxTrackSizingFunction.length(20)).intoRaw().value(), 20);
});
test("max track definite limits and percentage checks mirror Rust", () => {
    const fitPx = MaxTrackSizingFunction.fitContentPx(40);
    assert.equal(fitPx.definiteValue(100), undefined);
    assert.equal(fitPx.definiteLimit(100), 40);
    assert.equal(fitPx.isMaxContentAlike(), true);
    const fitPercent = MaxTrackSizingFunction.fitContentPercent(0.25);
    assert.equal(fitPercent.definiteLimit(undefined), undefined);
    assert.equal(fitPercent.definiteLimit(400), 100);
    assert.equal(fitPercent.usesPercentage(), true);
});
test("track sizing parsers mirror Rust parse feature", () => {
    assert.equal(minTrackSizingFunctionFromString("12px").intoRaw().value(), 12);
    assert.equal(min_track_sizing_function_from_string("25%").into_raw().value(), 0.25);
    assert.equal(MinTrackSizingFunction.fromString("auto").isAuto(), true);
    assert.equal(MinTrackSizingFunction.from_string("min-content").isMinContent(), true);
    assert.equal(MinTrackSizingFunction.fromString("max-content").isMaxContent(), true);
    assert.equal(maxTrackSizingFunctionFromString("2fr").intoRaw().tag(), CompactLengthTag.Fr);
    assert.equal(max_track_sizing_function_from_string("+0fr").into_raw().value(), 0);
    assert.equal(MaxTrackSizingFunction.fromString("fit-content(20px)").intoRaw().tag(), CompactLengthTag.FitContentPx);
    assert.equal(MaxTrackSizingFunction.from_string("fit-content(50%)").into_raw().value(), 0.5);
    assert.equal(MaxTrackSizingFunction.fromString("max-content").isMaxContent(), true);
    const minmaxTrack = trackSizingFunctionFromString("minmax(10px, 1fr)");
    assert.equal(minmaxTrack.min.intoRaw().value(), 10);
    assert.equal(minmaxTrack.max.intoRaw().tag(), CompactLengthTag.Fr);
    const scalarTrack = track_sizing_function_from_string("fit-content(25%)");
    assert.equal(scalarTrack.min.isAuto(), true);
    assert.equal(scalarTrack.max.intoRaw().tag(), CompactLengthTag.FitContentPercent);
    assert.equal(TrackSizingFunction.fromString("auto").min.isAuto(), true);
    assert.equal(TrackSizingFunction.from_string("40%").max.into_raw().value(), 0.4);
    assert.throws(() => minTrackSizingFunctionFromString("1fr"), ParseError);
    assert.throws(() => maxTrackSizingFunctionFromString("-1fr"), ParseError);
    assert.throws(() => maxTrackSizingFunctionFromString("fit-content(auto)"), ParseError);
    assert.throws(() => trackSizingFunctionFromString("minmax(1fr, 10px)"), ParseError);
    assert.throws(() => trackSizingFunctionFromString("minmax(10px 1fr)"), ParseError);
    assert.throws(() => trackSizingFunctionFromString("10PX"), ParseError);
});
test("grid helper constructors mirror Rust helper module", () => {
    assert.deepEqual(repetitionCountFrom(3), { type: "Count", count: 3 });
    assert.deepEqual(repetitionCountFrom("auto-fit"), { type: "AutoFit" });
    assert.deepEqual(repetitionCountFrom("auto-fill"), { type: "AutoFill" });
    assert.deepEqual(repetitionCountFromString("3"), { type: "Count", count: 3 });
    assert.deepEqual(repetition_count_from_string("+4"), { type: "Count", count: 4 });
    assert.deepEqual(repetitionCountFromString("auto-fit"), { type: "AutoFit" });
    assert.deepEqual(repetitionCountFromString("auto-fill"), { type: "AutoFill" });
    assert.throws(() => repetitionCountFrom("auto"), InvalidStringRepetitionValue);
    assert.throws(() => repetitionCountFromString("0"), ParseError);
    assert.throws(() => repetitionCountFromString("-1"), ParseError);
    assert.throws(() => repetitionCountFromString("1.5"), ParseError);
    assert.throws(() => repetitionCountFromString("AUTO-FIT"), ParseError);
    assert.throws(() => repeat("auto", [flex(1)]), /&str can only be converted to GridTrackRepetition if it's value is 'auto-fit' or 'auto-fill'/);
    const repeated = repeat("auto-fit", [flex(1)]);
    assert.deepEqual(helperRepeat("auto-fit", [helperFlex(1)]), repeated);
    assert.deepEqual(helper_evenly_sized_tracks(4), evenly_sized_tracks(4));
    assert.deepEqual(helperEvenlySizedTracks(4), evenlySizedTracks(4));
    assert.deepEqual(helperMinmax(MinTrackSizingFunction.length(1), MaxTrackSizingFunction.length(2)), minmax(MinTrackSizingFunction.length(1), MaxTrackSizingFunction.length(2)));
    assert.deepEqual(helperFr(2), fr(2));
    assert.deepEqual(helperLine(3), gridPlacementLine(3));
    assert.deepEqual(helperSpan(2), gridPlacementSpan(2));
    assert.equal(gridTemplateComponentIsAutoRepetition(repeated), true);
    assert.equal(grid_template_component_is_auto_repetition(repeated), true);
    assert.equal(gridTemplateComponentAsComponentRef(repeated), repeated);
    assert.equal(grid_template_component_as_component_ref(repeated), repeated);
    assert.equal(repeated.type, "Repeat");
    assert.deepEqual(repeated.repetition.count, { type: "AutoFit" });
    assert.deepEqual(repeated.repetition.count_(), { type: "AutoFit" });
    assert.equal(repeated.repetition.trackCount(), 1);
    assert.equal(repeated.repetition.track_count(), 1);
    assert.equal(repeated.repetition.tracks_(), repeated.repetition.tracks);
    assert.equal(repeated.repetition.linesNames(), repeated.repetition.lineNames);
    assert.equal(repeated.repetition.lines_names(), repeated.repetition.lineNames);
    repeated.repetition.line_names = [["a"]];
    assert.deepEqual(repeated.repetition.lineNames, [["a"]]);
    repeated.repetition.lineNames = [["b"]];
    assert.deepEqual(repeated.repetition.line_names, [["b"]]);
    const genericRepetition = repeated.repetition;
    const lineNames = genericRepetition.lines_names();
    assert.deepEqual(genericRepetition.count_(), { type: "AutoFit" });
    assert.equal(genericRepetition.track_count(), 1);
    assert.deepEqual(lineNames, [["b"]]);
    const tracks = evenlySizedTracks(4);
    assert.equal(tracks.length, 1);
    assert.equal(gridTemplateComponentIsAutoRepetition(tracks[0]), false);
    assert.equal(grid_template_component_is_auto_repetition(tracks[0]), false);
    assert.equal(gridTemplateComponentAsComponentRef(tracks[0]), tracks[0]);
    assert.deepEqual(evenly_sized_tracks(4), tracks);
    const templateTracks = new GridTemplateTracks([TrackSizingFunction.length(12)], [["main"]]);
    assert.deepEqual(templateTracks.tracks, [TrackSizingFunction.length(12)]);
    assert.deepEqual(templateTracks.line_names, [["main"]]);
    templateTracks.line_names = [["aside"]];
    assert.deepEqual(templateTracks.lineNames, [["aside"]]);
    assert.deepEqual(GridTemplateTracks.default().tracks, []);
    assert.deepEqual(GridTemplateTracks.default().lineNames, []);
    const autoTracks = new GridAutoTracks([TrackSizingFunction.fr(1)]);
    assert.deepEqual(autoTracks.tracks, [TrackSizingFunction.fr(1)]);
    assert.deepEqual(autoTracks[0], [TrackSizingFunction.fr(1)]);
    assert.deepEqual(GridAutoTracks.default().tracks, []);
    assert.equal(GridAutoTracks.fromString("10px minmax(20px, 1fr)").tracks.length, 2);
    assert.equal(gridAutoTracksFromString("fit-content(25%) 2fr").tracks[0].max.intoRaw().tag(), CompactLengthTag.FitContentPercent);
    assert.equal(grid_auto_tracks_from_string("auto").tracks[0].min.isAuto(), true);
    assert.throws(() => GridAutoTracks.from_string(""), ParseError);
    assert.throws(() => gridAutoTracksFromString("10px minmax(20px, 1fr"), ParseError);
    assert.throws(() => gridAutoTracksFromString("10px bad-token"), ParseError);
});
test("grid template track parsers mirror Rust parse feature", () => {
    const tracks = gridTemplateTracksFromString("[start main] 10px [middle] minmax(20px, 1fr) [end]");
    assert.equal(tracks.tracks.length, 2);
    assert.deepEqual(tracks.lineNames, [["start", "main"], ["middle"], ["end"]]);
    assert.equal(tracks.tracks[0].max.intoRaw().value(), 10);
    assert.equal(tracks.tracks[1].max.intoRaw().tag(), CompactLengthTag.Fr);
    assert.deepEqual(grid_template_tracks_from_string("1fr").lineNames, []);
    const adjacent = GridTemplateTracks.fromString("[start]10px[end]");
    assert.deepEqual(adjacent.line_names, [["start"], ["end"]]);
    assert.equal(GridTemplateTracks.from_string("minmax(10px, 1fr)").tracks[0].min.into_raw().value(), 10);
    assert.throws(() => gridTemplateTracksFromString("[only-names]"), ParseError);
    assert.throws(() => gridTemplateTracksFromString("10px [a] [b]"), ParseError);
    assert.throws(() => gridTemplateTracksFromString("10px [bad"), ParseError);
    assert.throws(() => gridTemplateTracksFromString("10px [1bad]"), ParseError);
});
test("grid template component parser mirrors Rust parse feature", () => {
    const single: any = gridTemplateComponentFromString("fit-content(30%)");
    assert.equal(single.type, "Single");
    if (single.type === "Single") {
        assert.equal(single.track.max.intoRaw().tag(), CompactLengthTag.FitContentPercent);
    }
    const repeated: any = grid_template_component_from_string("repeat(auto-fit, [col] 10px [gap] minmax(20px, 1fr) [end])");
    assert.equal(repeated.type, "Repeat");
    if (repeated.type === "Repeat") {
        assert.deepEqual(repeated.repetition.count, { type: "AutoFit" });
        assert.equal(repeated.repetition.tracks.length, 2);
        assert.deepEqual(repeated.repetition.lineNames, [["col"], ["gap"], ["end"]]);
        assert.equal(repeated.repetition.tracks[1].max.intoRaw().tag(), CompactLengthTag.Fr);
    }
    const countRepeat: any = gridTemplateComponentFromString("repeat(2,[a]10px[b])");
    assert.equal(countRepeat.type, "Repeat");
    if (countRepeat.type === "Repeat") {
        assert.deepEqual(countRepeat.repetition.count, { type: "Count", count: 2 });
        assert.deepEqual(countRepeat.repetition.line_names, [["a"], ["b"]]);
    }
    assert.throws(() => gridTemplateComponentFromString("repeat(auto, 10px)"), ParseError);
    assert.throws(() => gridTemplateComponentFromString("repeat(2 10px)"), ParseError);
    assert.throws(() => gridTemplateComponentFromString("repeat(2, 10px, 20px)"), ParseError);
});
test("grid placement parser mirrors Rust parse feature", () => {
    assert.deepEqual(gridPlacementFromString("auto"), { type: "Auto" });
    assert.deepEqual(gridPlacementFromString("2"), { type: "Line", line: 2 });
    assert.deepEqual(grid_placement_from_string("-2"), { type: "Line", line: -2 });
    assert.deepEqual(gridPlacementFromString("main"), { type: "NamedLine", name: "main", line: 0 });
    assert.deepEqual(gridPlacementFromString("main 3"), { type: "NamedLine", name: "main", line: 3 });
    assert.deepEqual(gridPlacementFromString("3 main"), { type: "NamedLine", name: "main", line: 3 });
    assert.deepEqual(gridPlacementFromString("span"), { type: "Span", span: 0 });
    assert.deepEqual(gridPlacementFromString("span 4"), { type: "Span", span: 4 });
    assert.deepEqual(gridPlacementFromString("span main"), {
        type: "NamedSpan",
        name: "main",
        span: 0,
    });
    assert.deepEqual(gridPlacementFromString("span main 2"), {
        type: "NamedSpan",
        name: "main",
        span: 2,
    });
    assert.deepEqual(gridPlacementFromString("AUTO"), { type: "NamedLine", name: "AUTO", line: 0 });
    assert.throws(() => gridPlacementFromString(""), ParseError);
    assert.throws(() => gridPlacementFromString("0"), ParseError);
    assert.throws(() => gridPlacementFromString("auto 1"), ParseError);
    assert.throws(() => gridPlacementFromString("span span"), ParseError);
    assert.throws(() => gridPlacementFromString("main aside"), ParseError);
    assert.throws(() => gridPlacementFromString("1 2"), ParseError);
});
test("generic grid public types mirror Rust aliases", () => {
    const placementAuto = { type: "Auto" };
    const placementLine = { type: "Line", line: 4 };
    const placementSpan = { type: "Span", span: 2 };
    assert.deepEqual([placementAuto, placementLine, placementSpan], [{ type: "Auto" }, { type: "Line", line: 4 }, { type: "Span", span: 2 }]);
    const genericSingle = {
        type: "Single",
        track: TrackSizingFunction.length(12),
    };
    const genericRepeat = {
        type: "Repeat",
        repetition: { count: "once", tracks: [TrackSizingFunction.fr(1)] },
    };
    assert.equal(genericSingle.track.max.intoRaw().value(), 12);
    assert.deepEqual(genericRepeat.repetition.count, "once");
});
test("grid template component single constructors mirror Rust scalar conversions", () => {
    const area = new GridTemplateArea("main", 1, 3, 2, 4);
    assert.equal(area.row_start, 1);
    assert.equal(area.row_end, 3);
    assert.equal(area.column_start, 2);
    assert.equal(area.column_end, 4);
    area.row_start = 5;
    area.row_end = 7;
    area.column_start = 6;
    area.column_end = 8;
    assert.equal(area.rowStart, 5);
    assert.equal(area.rowEnd, 7);
    assert.equal(area.columnStart, 6);
    assert.equal(area.columnEnd, 8);
    const single = gridTemplateComponentSingle(lengthTrack(12));
    assert.equal(single.type, "Single");
    assert.equal(single.track.min.intoRaw().value(), 12);
    const auto = gridTemplateComponentAuto();
    assert.equal(auto.type, "Single");
    assert.equal(auto.track.min.isAuto(), true);
    assert.equal(auto.track.max.isAuto(), true);
    const minContent = gridTemplateComponentMinContent();
    assert.equal(minContent.type, "Single");
    assert.equal(minContent.track.min.isMinContent(), true);
    assert.equal(minContent.track.max.isMinContent(), true);
    const maxContent = gridTemplateComponentMaxContent();
    assert.equal(maxContent.type, "Single");
    assert.equal(maxContent.track.min.isMaxContent(), true);
    assert.equal(maxContent.track.max.isMaxContent(), true);
    const fitContent = gridTemplateComponentFitContent(LengthPercentage.percent(0.5));
    assert.equal(fitContent.type, "Single");
    assert.equal(fitContent.track.min.isAuto(), true);
    assert.equal(fitContent.track.max.intoRaw().tag(), CompactLengthTag.FitContentPercent);
    const zero = gridTemplateComponentZero();
    assert.equal(zero.type, "Single");
    assert.equal(zero.track.min.intoRaw().value(), 0);
    assert.equal(zero.track.max.intoRaw().value(), 0);
    const length = gridTemplateComponentLength(8);
    assert.equal(length.type, "Single");
    assert.equal(length.track.max.intoRaw().value(), 8);
    const percent = gridTemplateComponentPercent(0.25);
    assert.equal(percent.type, "Single");
    assert.equal(percent.track.max.intoRaw().tag(), CompactLengthTag.Percent);
    const fraction = gridTemplateComponentFr(2);
    assert.equal(fraction.type, "Single");
    assert.equal(fraction.track.max.intoRaw().tag(), CompactLengthTag.Fr);
});
test("grid auto-flow helpers mirror Rust enum methods", () => {
    assert.equal(gridAutoFlowIsDense(GridAutoFlow.Row), false);
    assert.equal(gridAutoFlowIsDense(GridAutoFlow.Column), false);
    assert.equal(gridAutoFlowIsDense(GridAutoFlow.RowDense), true);
    assert.equal(gridAutoFlowIsDense(GridAutoFlow.ColumnDense), true);
    assert.equal(grid_auto_flow_is_dense(GridAutoFlow.ColumnDense), true);
    assert.equal(GridAutoFlow.is_dense(GridAutoFlow.Row), false);
    assert.equal(gridAutoFlowPrimaryAxis(GridAutoFlow.Row), AbsoluteAxis.Horizontal);
    assert.equal(gridAutoFlowPrimaryAxis(GridAutoFlow.RowDense), AbsoluteAxis.Horizontal);
    assert.equal(gridAutoFlowPrimaryAxis(GridAutoFlow.Column), AbsoluteAxis.Vertical);
    assert.equal(gridAutoFlowPrimaryAxis(GridAutoFlow.ColumnDense), AbsoluteAxis.Vertical);
    assert.equal(grid_auto_flow_primary_axis(GridAutoFlow.RowDense), AbsoluteAxis.Horizontal);
    assert.equal(GridAutoFlow.primary_axis(GridAutoFlow.Column), AbsoluteAxis.Vertical);
});
test("Style grid trait helper methods mirror Rust axis dispatch", () => {
    const rows = [gridTemplateComponentSingle(TrackSizingFunction.length(12))];
    const columns = [gridTemplateComponentSingle(TrackSizingFunction.fr(1))];
    const rowPlacement = new Line(gridPlacementLine(2), gridPlacementSpan(3));
    const columnPlacement = new Line(gridPlacementSpan(4), gridPlacementLine(-1));
    const style = new Style({
        alignContent: AlignContent.End,
        justifyContent: AlignContent.SpaceBetween,
        gridTemplateRows: rows,
        gridTemplateColumns: columns,
        gridRow: rowPlacement,
        gridColumn: columnPlacement,
    });
    assert.equal(style.grid_template_tracks(AbsoluteAxis.Horizontal), columns);
    assert.equal(style.grid_template_tracks(AbsoluteAxis.Vertical), rows);
    assert.equal(style.grid_align_content(AbstractAxis.Inline), AlignContent.SpaceBetween);
    assert.equal(style.grid_align_content(AbstractAxis.Block), AlignContent.End);
    assert.equal(new Style().grid_align_content(AbstractAxis.Inline), AlignContent.Stretch);
    assert.equal(new Style().grid_align_content(AbstractAxis.Block), AlignContent.Stretch);
    assert.equal(style.grid_placement(AbsoluteAxis.Horizontal), columnPlacement);
    assert.equal(style.grid_placement(AbsoluteAxis.Vertical), rowPlacement);
});
test("grid placement helpers mirror Rust line and span conversions", () => {
    assert.deepEqual(gridPlacementLine(2), { type: "Line", line: 2 });
    assert.deepEqual(gridPlacementSpan(3), { type: "Span", span: 3 });
    assert.deepEqual(gridPlacementNamedLine("main", -1), {
        type: "NamedLine",
        name: "main",
        line: -1,
    });
    assert.deepEqual(gridPlacementNamedSpan("main", 2), { type: "NamedSpan", name: "main", span: 2 });
});
test("grid coordinate helpers mirror Rust origin-zero conversions", () => {
    const counts = TrackCounts.fromRaw(2, 4, 3);
    assert.deepEqual(TrackCounts.default(), new TrackCounts(0, 0, 0));
    assert.deepEqual(TrackCounts.from_raw(2, 4, 3), counts);
    assert.equal(counts.len(), 9);
    assert.equal(counts.implicitStartLine(), -2);
    assert.equal(counts.implicit_start_line(), -2);
    assert.equal(counts.implicitEndLine(), 7);
    assert.equal(counts.implicit_end_line(), 7);
    assert.equal(counts.ozLineToNextTrack(-2), 0);
    assert.equal(counts.oz_line_to_next_track(3), 5);
    assert.deepEqual(counts.ozLineRangeToTrackRange(new Line(-1, 4)), new Line(1, 6));
    assert.deepEqual(counts.oz_line_range_to_track_range(new Line(-1, 4)), new Line(1, 6));
    assert.equal(counts.trackToPrevOzLine(0), -2);
    assert.equal(counts.track_to_prev_oz_line(5), 3);
    assert.deepEqual(counts.trackRangeToOzLineRange(new Line(1, 6)), new Line(-1, 4));
    assert.deepEqual(counts.track_range_to_oz_line_range(new Line(1, 6)), new Line(-1, 4));
    assert.equal(gridLineAsI16(-2), -2);
    assert.equal(grid_line_as_i16(3), 3);
    assert.equal(gridLineIntoOriginZeroLine(1, 4), 0);
    assert.equal(gridLineIntoOriginZeroLine(-1, 4), 4);
    assert.equal(grid_line_into_origin_zero_line(-2, 4), 3);
    assert.throws(() => gridLineIntoOriginZeroLine(0, 4), /zero is invalid/);
    assert.equal(originZeroLineTryIntoTrackVecIndex(-2, counts), 0);
    assert.equal(originZeroLineTryIntoTrackVecIndex(0, counts), 4);
    assert.equal(originZeroLineTryIntoTrackVecIndex(7, counts), 18);
    assert.equal(originZeroLineTryIntoTrackVecIndex(-3, counts), undefined);
    assert.equal(originZeroLineTryIntoTrackVecIndex(8, counts), undefined);
    assert.equal(origin_zero_line_try_into_track_vec_index(0, counts), 4);
    assert.equal(originZeroLineIntoTrackVecIndex(3, counts), 10);
    assert.equal(origin_zero_line_into_track_vec_index(3, counts), 10);
    assert.throws(() => originZeroLineIntoTrackVecIndex(-3, counts), /less than/);
    assert.throws(() => originZeroLineIntoTrackVecIndex(8, counts), /more than/);
    assert.equal(originZeroLineImpliedNegativeImplicitTracks(-3), 3);
    assert.equal(origin_zero_line_implied_negative_implicit_tracks(2), 0);
    assert.equal(originZeroLineImpliedPositiveImplicitTracks(7, 4), 3);
    assert.equal(origin_zero_line_implied_positive_implicit_tracks(3, 4), 0);
    assert.equal(originZeroLineSpan(new Line(-1, 4)), 5);
    assert.equal(originZeroLineSpan(new Line(4, -1)), 0);
    assert.equal(origin_zero_line_span(new Line(-1, 4)), 5);
});
test("grid placement origin-zero helpers mirror Rust named-ignoring conversion", () => {
    assert.deepEqual(gridPlacementIntoOriginZeroIgnoringNamed(gridPlacementLine(1), 4), {
        type: "Line",
        line: 0,
    });
    assert.deepEqual(gridPlacementIntoOriginZeroIgnoringNamed(gridPlacementLine(-1), 4), {
        type: "Line",
        line: 4,
    });
    assert.deepEqual(gridPlacementIntoOriginZeroIgnoringNamed(gridPlacementLine(0), 4), {
        type: "Auto",
    });
    assert.deepEqual(gridPlacementIntoOriginZeroIgnoringNamed(gridPlacementNamedLine("main", 1), 4), {
        type: "Auto",
    });
    assert.deepEqual(gridPlacementIntoOriginZeroIgnoringNamed(gridPlacementNamedSpan("main", 2), 4), {
        type: "Auto",
    });
    const linePlacement = gridPlacementLineIntoOriginZeroIgnoringNamed(new Line(gridPlacementLine(-2), gridPlacementSpan(3)), 4);
    assert.deepEqual(linePlacement.start, { type: "Line", line: 3 });
    assert.deepEqual(linePlacement.end, { type: "Span", span: 3 });
});
test("grid placement definiteness mirrors Rust public placement rules", () => {
    assert.equal(gridPlacementLineIsDefinite(new Line(gridPlacementLine(0), gridPlacementSpan(2))), false);
    assert.equal(gridPlacementLineIsDefinite(new Line(gridPlacementLine(1), gridPlacementSpan(2))), true);
    assert.equal(gridPlacementLineIsDefinite(new Line(gridPlacementSpan(2), gridPlacementLine(-1))), true);
    assert.equal(gridPlacementLineIsDefinite(new Line(gridPlacementNamedLine("main", 0), gridPlacementSpan(2))), true);
});
test("non-named grid placement helpers mirror Rust origin-zero conversion", () => {
    assert.deepEqual(nonNamedGridPlacementIntoOriginZero({ type: "Line", line: 3 }, 4), {
        type: "Line",
        line: 2,
    });
    assert.deepEqual(nonNamedGridPlacementIntoOriginZero({ type: "Line", line: -2 }, 4), {
        type: "Line",
        line: 3,
    });
    assert.deepEqual(nonNamedGridPlacementIntoOriginZero({ type: "Line", line: 0 }, 4), {
        type: "Auto",
    });
    assert.deepEqual(nonNamedGridPlacementIntoOriginZero({ type: "Span", span: 2 }, 4), {
        type: "Span",
        span: 2,
    });
    const converted = nonNamedGridPlacementLineIntoOriginZero(new Line({ type: "Line", line: 2 }, { type: "Line", line: 0 }), 4);
    assert.deepEqual(converted.start, { type: "Line", line: 1 });
    assert.deepEqual(converted.end, { type: "Auto" });
    assert.equal(nonNamedGridPlacementLineIsDefinite(new Line({ type: "Line", line: 0 }, { type: "Span", span: 2 })), false);
    assert.equal(nonNamedGridPlacementLineIsDefinite(new Line({ type: "Auto" }, { type: "Line", line: -1 })), true);
});
test("origin-zero grid placement definiteness and indefinite spans mirror Rust", () => {
    assert.equal(originZeroGridPlacementLineIsDefinite(new Line({ type: "Auto" }, { type: "Span", span: 3 })), false);
    assert.equal(originZeroGridPlacementLineIsDefinite(new Line({ type: "Line", line: 0 }, { type: "Auto" })), true);
    assert.equal(originZeroGridPlacementLineIndefiniteSpan(new Line({ type: "Auto" }, { type: "Auto" })), 1);
    assert.equal(originZeroGridPlacementLineIndefiniteSpan(new Line({ type: "Line", line: 2 }, { type: "Span", span: 4 })), 4);
    assert.equal(originZeroGridPlacementLineIndefiniteSpan(new Line({ type: "Span", span: 3 }, { type: "Line", line: 8 })), 3);
    assert.equal(originZeroGridPlacementLineIndefiniteSpan(new Line({ type: "Span", span: 5 }, { type: "Span", span: 2 })), 5);
    assert.throws(() => originZeroGridPlacementLineIndefiniteSpan(new Line({ type: "Line", line: 1 }, { type: "Line", line: 3 })));
});
test("origin-zero grid placement resolution helpers mirror Rust definite and absolute cases", () => {
    assert.deepEqual(originZeroGridPlacementLineResolveDefiniteGridLines(new Line({ type: "Line", line: 2 }, { type: "Line", line: 2 })), new Line(2, 3));
    assert.deepEqual(originZeroGridPlacementLineResolveDefiniteGridLines(new Line({ type: "Line", line: 6 }, { type: "Line", line: 2 })), new Line(2, 6));
    assert.deepEqual(originZeroGridPlacementLineResolveDefiniteGridLines(new Line({ type: "Span", span: 3 }, { type: "Line", line: 8 })), new Line(5, 8));
    assert.throws(() => originZeroGridPlacementLineResolveDefiniteGridLines(new Line({ type: "Auto" }, { type: "Span", span: 2 })));
    assert.deepEqual(originZeroGridPlacementLineResolveAbsolutelyPositionedGridTracks(new Line({ type: "Line", line: 2 }, { type: "Auto" })), new Line(2, undefined));
    assert.deepEqual(originZeroGridPlacementLineResolveAbsolutelyPositionedGridTracks(new Line({ type: "Auto" }, { type: "Line", line: 6 })), new Line(undefined, 6));
    assert.deepEqual(originZeroGridPlacementLineResolveAbsolutelyPositionedGridTracks(new Line({ type: "Span", span: 3 }, { type: "Auto" })), new Line(undefined, undefined));
});
test("origin-zero grid placement indefinite resolution mirrors Rust", () => {
    assert.deepEqual(originZeroGridPlacementLineResolveIndefiniteGridTracks(new Line({ type: "Auto" }, { type: "Auto" }), 4), new Line(4, 5));
    assert.deepEqual(originZeroGridPlacementLineResolveIndefiniteGridTracks(new Line({ type: "Span", span: 3 }, { type: "Auto" }), 4), new Line(4, 7));
    assert.deepEqual(originZeroGridPlacementLineResolveIndefiniteGridTracks(new Line({ type: "Auto" }, { type: "Span", span: 2 }), 4), new Line(4, 6));
    assert.deepEqual(originZeroGridPlacementLineResolveIndefiniteGridTracks(new Line({ type: "Span", span: 5 }, { type: "Span", span: 2 }), 4), new Line(4, 9));
    assert.throws(() => originZeroGridPlacementLineResolveIndefiniteGridTracks(new Line({ type: "Line", line: 2 }, { type: "Auto" }), 4));
});
test("minmax and fit-content expose underlying min/max sizing functions", () => {
    const explicit = minmax(MinTrackSizingFunction.minContent(), MaxTrackSizingFunction.maxContent());
    assert.equal(explicit.minSizingFunction().isMinContent(), true);
    assert.equal(explicit.maxSizingFunction().isMaxContent(), true);
    const fit = TrackSizingFunction.fitContent(LengthPercentage.percent(0.5));
    assert.equal(fit.min.isAuto(), true);
    assert.equal(fit.max.intoRaw().tag(), CompactLengthTag.FitContentPercent);
});

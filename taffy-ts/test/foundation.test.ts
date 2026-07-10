import assert from "node:assert/strict";
import test from "node:test";
import { AbstractAxis, AbsoluteAxis, AlignContent, AlignItems, AvailableSpace, AvailableSpaceSize, BoxGenerationMode, BoxSizing, Clear, CompactLength, CompactLengthTag, computeLeafLayout, Dimension, Direction, Display, FlexDirection, FlexWrap, Float, FloatDirection, GridAutoFlow, GridTemplateArea, Line, LayoutInput, LengthPercentage, LengthPercentageAuto, MaxTrackSizingFunction, MinMax, Overflow, ParseError, Point, Position, Rect, RequestedAxis, RunMode, Size, SizingMode, Style, TaffyTree, TextAlign, TrackSizingFunction, alignContentReversed, alignItemsFromString, auto, availableSpaceMaybeAdd, availableSpaceMaybeClamp, availableSpaceMaybeMax, availableSpaceMaybeMin, availableSpaceMaybeSub, availableSpaceComputeFreeSpace, availableSpaceFromString, availableSpaceIntoOption, availableSpaceOrElse, availableSpaceUnwrap, availableSpaceUnwrapOrElse, available_space_compute_free_space, available_space_from_string, available_space_into_option, available_space_is_definite, available_space_is_roughly_equal, available_space_map_definite_value, available_space_maybe_add, available_space_maybe_clamp, available_space_maybe_max, available_space_maybe_min, available_space_maybe_set, available_space_maybe_sub, available_space_or, available_space_or_else, available_space_unwrap, available_space_unwrap_or, available_space_unwrap_or_else, dimensionRectFromLengths, dimensionRectFromPercent, dimensionFromString, dimensionSizeFromLengths, dimensionSizeFromPercent, dimension_from_string, direction_is_rtl, displayFromString, displayToString, display_to_string, boxSizingFromString, clear_from_string, flexDirectionFromString, flex_wrap_from_string, flex_direction_cross_axis, flex_direction_is_column, flex_direction_is_reverse, flex_direction_is_row, flex_direction_main_axis, flexDirectionCrossAxis, flexDirectionIsColumn, flexDirectionIsReverse, flexDirectionIsRow, flexDirectionMainAxis, absoluteAxisOther, abstractAxisAsAbsoluteNaive, abstractAxisOther, fitContent, fit_content, floatFromString, gridPlacementLine, gridPlacementSpan, gridTemplateComponentFr, gridTemplateComponentLength, gridAutoFlowFromString, grid_auto_flow_from_string, length, lengthPercentageAutoFromString, lengthPercentageFromString, length_percentage_auto_from_string, length_percentage_from_string, maxContent, max_content, maybe_add, maybe_add_optional_size, maybe_add_size, maybe_clamp, maybe_clamp_size, maybe_clamp_optional_size, maybeAddSize, minContent, min_content, maybe_min, maybe_min_optional_size, maybe_min_size, maybeMinOptionalSize, maybeMinSize, maybe_max, maybe_max_optional_size, maybe_max_size, maybeMaxSize, maybeResolveDimension, maybeResolveDimensionSize, maybeResolveLengthPercentageAutoSize, maybeResolveLengthPercentageSize, maybe_sub, maybe_sub_optional_size, maybe_sub_size, maybeSubSize, maybeSubOptionalSize, resolveDimensionOrZero, resolveDimensionRectOrZero, resolveDimensionSizeOrZero, resolveLengthPercentageAutoOrZero, resolveLengthPercentageAutoSizeOrZero, resolveLengthPercentageOrZero, resolveLengthPercentageSizeOrZero, percent, overflow_is_scroll_container, overflow_maybe_into_automatic_min_size, float_direction, float_is_floated, position_from_string, rect_add, rect_horizontal_axis_sum, rect_sum_axes, rect_vertical_axis_sum, size_add, size_available_space_into_options, size_available_space_maybe_set, size_get_abs, size_get_absolute, size_has_non_zero_area, sizeAvailableSpaceMaybeSet, textAlignFromString, zero, } from "../src/index.js";
test("keyword enum parsers mirror Rust FromStr parse feature", () => {
    assert.equal(displayFromString(" FLEX "), Display.Flex);
    assert.equal(Display.from_string("grid"), Display.Grid);
    assert.equal(alignItemsFromString("flex-end"), AlignItems.FlexEnd);
    assert.equal(AlignItems.from_string("baseline"), AlignItems.Baseline);
    assert.equal(AlignContent.fromString("space-evenly"), AlignContent.SpaceEvenly);
    assert.equal(position_from_string("absolute"), Position.Absolute);
    assert.equal(boxSizingFromString("content-box"), BoxSizing.ContentBox);
    assert.equal(Overflow.fromString("clip"), Overflow.Clip);
    assert.equal(Direction.fromString("RTL"), Direction.Rtl);
    assert.equal(flex_wrap_from_string("wrap-reverse"), FlexWrap.WrapReverse);
    assert.equal(flexDirectionFromString("row-reverse"), FlexDirection.RowReverse);
    assert.equal(textAlignFromString("-webkit-center"), TextAlign.LegacyCenter);
    assert.equal(floatFromString("right"), Float.Right);
    assert.equal(clear_from_string("both"), Clear.Both);
    assert.throws(() => displayFromString("inline"), ParseError);
    assert.throws(() => displayFromString("flex grid"), ParseError);
});
test("non-keyword parsers mirror Rust parse feature", () => {
    assert.deepEqual(availableSpaceFromString(" 12px "), AvailableSpace.definite(12));
    assert.deepEqual(available_space_from_string("+3.5fr"), AvailableSpace.definite(3.5));
    assert.deepEqual(AvailableSpace.from_string("min-content"), AvailableSpace.minContent());
    assert.deepEqual(AvailableSpace.fromString("max-content"), AvailableSpace.maxContent());
    assert.equal(gridAutoFlowFromString("dense"), GridAutoFlow.RowDense);
    assert.equal(grid_auto_flow_from_string("column dense"), GridAutoFlow.ColumnDense);
    assert.equal(GridAutoFlow.fromString("dense row"), GridAutoFlow.RowDense);
    assert.equal(GridAutoFlow.from_string("row column"), GridAutoFlow.Column);
    assert.throws(() => availableSpaceFromString("-1px"), ParseError);
    assert.throws(() => availableSpaceFromString("10%"), ParseError);
    assert.throws(() => AvailableSpace.fromString("MIN-CONTENT"), ParseError);
    assert.throws(() => gridAutoFlowFromString("row dense column"), ParseError);
    assert.throws(() => gridAutoFlowFromString("ROW"), ParseError);
});
test("dimension parsers mirror Rust parse feature", () => {
    assert.equal(lengthPercentageFromString("12px").intoRaw().value(), 12);
    assert.equal(length_percentage_from_string("-2.5px").into_raw().value(), -2.5);
    assert.equal(LengthPercentage.fromString("25%").intoRaw().value(), 0.25);
    assert.equal(LengthPercentage.from_string("-10%").into_raw().value(), -0.1);
    assert.equal(lengthPercentageAutoFromString("auto").isAuto(), true);
    assert.equal(length_percentage_auto_from_string("8px").into_raw().value(), 8);
    assert.equal(LengthPercentageAuto.fromString("33%").intoRaw().value(), 0.33);
    assert.equal(dimensionFromString("auto").isAuto(), true);
    assert.equal(dimension_from_string("7px").into_raw().value(), 7);
    assert.equal(Dimension.fromString("150%").intoRaw().value(), 1.5);
    assert.equal(Dimension.from_string("-4px").into_raw().value(), -4);
    assert.throws(() => lengthPercentageFromString("auto"), ParseError);
    assert.throws(() => lengthPercentageFromString("0"), ParseError);
    assert.throws(() => lengthPercentageAutoFromString("12em"), ParseError);
    assert.throws(() => dimensionFromString("AUTO"), ParseError);
});
test("Style.default mirrors Rust defaults for the ported fields", () => {
    const style = Style.default();
    const areaName = "main";
    assert.equal(Display.DEFAULT, Display.Flex);
    assert.equal(displayToString(Display.None), "NONE");
    assert.equal(display_to_string(Display.Block), "BLOCK");
    assert.equal(Display.toString(Display.Flex), "FLEX");
    assert.equal(Display.to_string(Display.Grid), "GRID");
    assert.equal(BoxGenerationMode.DEFAULT, BoxGenerationMode.Normal);
    assert.equal(Position.DEFAULT, Position.Relative);
    assert.equal(BoxSizing.DEFAULT, BoxSizing.BorderBox);
    assert.equal(Overflow.DEFAULT, Overflow.Visible);
    assert.equal(Direction.DEFAULT, Direction.Ltr);
    assert.equal(Float.DEFAULT, Float.None);
    assert.equal(Clear.DEFAULT, Clear.None);
    assert.equal(TextAlign.DEFAULT, TextAlign.Auto);
    assert.equal(FlexWrap.DEFAULT, FlexWrap.NoWrap);
    assert.equal(FlexDirection.DEFAULT, FlexDirection.Row);
    assert.equal(GridAutoFlow.DEFAULT, GridAutoFlow.Row);
    assert.deepEqual(Style.DEFAULT, Style.default());
    assert.notEqual(Style.DEFAULT, Style.DEFAULT);
    assert.equal(style.display, Display.Flex);
    assert.equal(style.itemIsTable, false);
    assert.equal(style.itemIsReplaced, false);
    assert.equal(style.boxGenerationMode(), BoxGenerationMode.Normal);
    assert.equal(new Style({ display: Display.None }).boxGenerationMode(), BoxGenerationMode.None);
    assert.equal(style.isBlock(), false);
    assert.equal(new Style({ display: Display.Block }).isBlock(), true);
    assert.equal(style.isCompressibleReplaced(), false);
    assert.equal(new Style({ itemIsReplaced: true }).isCompressibleReplaced(), true);
    assert.equal(style.isTable(), false);
    assert.equal(new Style({ itemIsTable: true }).isTable(), true);
    assert.equal(style.boxSizing, BoxSizing.BorderBox);
    assert.equal(style.direction, Direction.Ltr);
    assert.equal(style.overflow.x, Overflow.Visible);
    assert.equal(style.overflow.y, Overflow.Visible);
    assert.equal(style.scrollbarWidth, 0);
    assert.equal(style.position, Position.Relative);
    assert.equal(style.size.width.tag(), CompactLengthTag.Auto);
    assert.equal(style.minSize.width.tag(), CompactLengthTag.Auto);
    assert.equal(style.maxSize.height.tag(), CompactLengthTag.Auto);
    assert.equal(style.margin.left.intoRaw().tag(), CompactLengthTag.Length);
    assert.equal(style.padding.top.intoRaw().value(), 0);
    assert.equal(style.textAlign, TextAlign.Auto);
    assert.equal(style.flexDirection, FlexDirection.Row);
    assert.equal(style.flexWrap, FlexWrap.NoWrap);
    assert.equal(style.flexGrow, 0);
    assert.equal(style.flexShrink, 1);
    assert.equal(style.box_sizing(), style.boxSizing);
    assert.equal(style.direction_(), style.direction);
    assert.equal(style.overflow_(), style.overflow);
    assert.equal(style.scrollbar_width(), style.scrollbarWidth);
    assert.equal(style.position_(), style.position);
    assert.equal(style.inset_(), style.inset);
    assert.equal(style.size_(), style.size);
    assert.equal(style.min_size(), style.minSize);
    assert.equal(style.max_size(), style.maxSize);
    assert.equal(style.aspect_ratio(), style.aspectRatio);
    assert.equal(style.margin_(), style.margin);
    assert.equal(style.padding_(), style.padding);
    assert.equal(style.border_(), style.border);
    assert.equal(style.text_align(), style.textAlign);
    assert.equal(style.float_(), style.float);
    assert.equal(style.clear_(), style.clear);
    assert.equal(style.flex_direction(), style.flexDirection);
    assert.equal(style.flex_wrap(), style.flexWrap);
    assert.equal(style.gap_(), style.gap);
    assert.equal(style.align_content(), style.alignContent);
    assert.equal(style.align_items(), style.alignItems);
    assert.equal(style.justify_content(), style.justifyContent);
    assert.equal(style.flex_basis(), style.flexBasis);
    assert.equal(style.flex_grow(), style.flexGrow);
    assert.equal(style.flex_shrink(), style.flexShrink);
    assert.equal(style.align_self(), style.alignSelf);
    assert.equal(style.grid_template_rows(), style.gridTemplateRows);
    assert.equal(style.grid_template_columns(), style.gridTemplateColumns);
    assert.equal(style.grid_auto_rows(), style.gridAutoRows);
    assert.equal(style.grid_auto_columns(), style.gridAutoColumns);
    assert.equal(style.grid_auto_flow(), style.gridAutoFlow);
    assert.equal(style.justify_items(), style.justifyItems);
    assert.equal(style.grid_template_areas(), style.gridTemplateAreas);
    assert.equal(style.grid_template_column_names(), style.gridTemplateColumnNames);
    assert.equal(style.grid_template_row_names(), style.gridTemplateRowNames);
    assert.deepEqual(new GridTemplateArea(areaName, 0, 1, 0, 1).name, "main");
    assert.equal(style.grid_row_(), style.gridRow);
    assert.equal(style.grid_column_(), style.gridColumn);
    assert.equal(style.justify_self(), style.justifySelf);
    const customStyle = new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        scrollbarWidth: 7,
        position: Position.Absolute,
        aspectRatio: 2,
        float: Float.Left,
        clear: Clear.Both,
        textAlign: TextAlign.LegacyCenter,
        flexDirection: FlexDirection.Column,
        flexWrap: FlexWrap.Wrap,
        flexGrow: 2,
        flexShrink: 3,
        alignContent: AlignContent.Center,
        alignItems: AlignItems.End,
        justifyContent: AlignContent.SpaceBetween,
        justifyItems: AlignItems.Start,
        alignSelf: AlignItems.Stretch,
        justifySelf: AlignItems.FlexEnd,
        gridAutoFlow: GridAutoFlow.ColumnDense,
    });
    assert.equal(customStyle.box_sizing(), BoxSizing.ContentBox);
    assert.equal(customStyle.direction_(), Direction.Rtl);
    assert.equal(customStyle.scrollbar_width(), 7);
    assert.equal(customStyle.position_(), Position.Absolute);
    assert.equal(customStyle.aspect_ratio(), 2);
    assert.equal(customStyle.float_(), Float.Left);
    assert.equal(customStyle.clear_(), Clear.Both);
    assert.equal(customStyle.text_align(), TextAlign.LegacyCenter);
    assert.equal(customStyle.flex_direction(), FlexDirection.Column);
    assert.equal(customStyle.flex_wrap(), FlexWrap.Wrap);
    assert.equal(customStyle.flex_grow(), 2);
    assert.equal(customStyle.flex_shrink(), 3);
    assert.equal(customStyle.align_content(), AlignContent.Center);
    assert.equal(customStyle.align_items(), AlignItems.End);
    assert.equal(customStyle.justify_content(), AlignContent.SpaceBetween);
    assert.equal(customStyle.justify_items(), AlignItems.Start);
    assert.equal(customStyle.align_self(), AlignItems.Stretch);
    assert.equal(customStyle.justify_self(), AlignItems.FlexEnd);
    assert.equal(customStyle.grid_auto_flow(), GridAutoFlow.ColumnDense);
});
test("Style structurally satisfies Rust style trait surfaces", () => {
    const style = new Style({
        display: Display.Block,
        itemIsTable: true,
        itemIsReplaced: true,
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        overflow: new Point(Overflow.Hidden, Overflow.Scroll),
        scrollbarWidth: 12,
        position: Position.Absolute,
        textAlign: TextAlign.LegacyRight,
        float: Float.Right,
        clear: Clear.Both,
        flexDirection: FlexDirection.Column,
        flexWrap: FlexWrap.WrapReverse,
        alignContent: AlignContent.End,
        alignItems: AlignItems.Center,
        justifyContent: AlignContent.SpaceAround,
        justifyItems: AlignItems.FlexStart,
        alignSelf: AlignItems.Stretch,
        justifySelf: AlignItems.FlexEnd,
        flexGrow: 2,
        flexShrink: 3,
        flexBasis: Dimension.length(44),
        gridAutoFlow: GridAutoFlow.ColumnDense,
        gridTemplateRows: [gridTemplateComponentLength(10)],
        gridTemplateColumns: [gridTemplateComponentFr(1)],
        gridAutoRows: [TrackSizingFunction.length(20)],
        gridAutoColumns: [TrackSizingFunction.fr(1)],
        gridRow: new Line(gridPlacementLine(1), gridPlacementSpan(2)),
        gridColumn: new Line(gridPlacementSpan(3), gridPlacementLine(-1)),
    });
    const core = style;
    const blockContainer = style;
    const blockItem = style;
    const flexContainer = style;
    const flexItem = style;
    const gridContainer = style;
    const gridItem = style;
    assert.equal(core.box_generation_mode(), BoxGenerationMode.Normal);
    assert.equal(core.is_block(), true);
    assert.equal(core.is_compressible_replaced(), true);
    assert.equal(core.box_sizing(), BoxSizing.ContentBox);
    assert.equal(core.direction_(), Direction.Rtl);
    assert.deepEqual(core.overflow_(), new Point(Overflow.Hidden, Overflow.Scroll));
    assert.equal(core.scrollbar_width(), 12);
    assert.equal(core.position_(), Position.Absolute);
    assert.equal(core.size_(), style.size);
    assert.equal(core.min_size(), style.minSize);
    assert.equal(core.max_size(), style.maxSize);
    assert.equal(core.margin_(), style.margin);
    assert.equal(core.padding_(), style.padding);
    assert.equal(core.border_(), style.border);
    assert.equal(blockContainer.text_align(), TextAlign.LegacyRight);
    assert.equal(blockItem.is_table(), true);
    assert.equal(blockItem.float_(), Float.Right);
    assert.equal(blockItem.clear_(), Clear.Both);
    assert.equal(flexContainer.flex_direction(), FlexDirection.Column);
    assert.equal(flexContainer.flex_wrap(), FlexWrap.WrapReverse);
    assert.equal(flexContainer.align_content(), AlignContent.End);
    assert.equal(flexContainer.align_items(), AlignItems.Center);
    assert.equal(flexContainer.justify_content(), AlignContent.SpaceAround);
    assert.equal(flexItem.flex_basis().intoRaw().value(), 44);
    assert.equal(flexItem.flex_grow(), 2);
    assert.equal(flexItem.flex_shrink(), 3);
    assert.equal(flexItem.align_self(), AlignItems.Stretch);
    assert.equal(gridContainer.grid_template_rows(), style.gridTemplateRows);
    assert.equal(gridContainer.grid_template_columns(), style.gridTemplateColumns);
    assert.equal(gridContainer.grid_auto_rows(), style.gridAutoRows);
    assert.equal(gridContainer.grid_auto_columns(), style.gridAutoColumns);
    assert.equal(gridContainer.grid_auto_flow(), GridAutoFlow.ColumnDense);
    assert.equal(gridContainer.justify_items(), AlignItems.FlexStart);
    assert.equal(gridContainer.grid_template_tracks(AbsoluteAxis.Horizontal), style.gridTemplateColumns);
    assert.equal(gridContainer.grid_align_content(AbstractAxis.Inline), AlignContent.SpaceAround);
    assert.equal(gridItem.grid_row_(), style.gridRow);
    assert.equal(gridItem.grid_column_(), style.gridColumn);
    assert.equal(gridItem.grid_placement(AbsoluteAxis.Vertical), style.gridRow);
    assert.equal(gridItem.justify_self(), AlignItems.FlexEnd);
});
test("Style constructor accepts Rust snake_case field aliases", () => {
    const rowTrack = gridTemplateComponentLength(10);
    const columnTrack = gridTemplateComponentFr(1);
    const autoRow = TrackSizingFunction.length(20);
    const autoColumn = TrackSizingFunction.fr(2);
    const area = new GridTemplateArea("main", 0, 1, 0, 2);
    const rowPlacement = gridPlacementLine(2);
    const columnPlacement = new Line(gridPlacementSpan(3), gridPlacementLine(-1));
    const style = new Style({
        item_is_table: true,
        item_is_replaced: true,
        box_sizing: BoxSizing.ContentBox,
        scrollbar_width: 12,
        min_size: new Size(Dimension.length(10), Dimension.length(20)),
        max_size: new Size(Dimension.length(30), Dimension.length(40)),
        aspect_ratio: 2,
        align_items: AlignItems.Center,
        align_self: AlignItems.Stretch,
        justify_items: AlignItems.FlexStart,
        justify_self: AlignItems.FlexEnd,
        align_content: AlignContent.End,
        justify_content: AlignContent.SpaceAround,
        text_align: TextAlign.LegacyCenter,
        flex_direction: FlexDirection.Column,
        flex_wrap: FlexWrap.Wrap,
        flex_basis: Dimension.length(44),
        flex_grow: 2,
        flex_shrink: 3,
        grid_template_rows: [rowTrack],
        grid_template_columns: [columnTrack],
        grid_auto_rows: [autoRow],
        grid_auto_columns: [autoColumn],
        grid_auto_flow: GridAutoFlow.ColumnDense,
        grid_template_areas: [area],
        grid_template_column_names: [["left"]],
        grid_template_row_names: [["top"]],
        grid_row: rowPlacement,
        grid_column: columnPlacement,
    });
    assert.equal(style.itemIsTable, true);
    assert.equal(style.item_is_table, true);
    style.item_is_table = false;
    assert.equal(style.itemIsTable, false);
    assert.equal(style.itemIsReplaced, true);
    assert.equal(style.item_is_replaced, true);
    style.item_is_replaced = false;
    assert.equal(style.itemIsReplaced, false);
    assert.equal(style.boxSizing, BoxSizing.ContentBox);
    assert.equal(style.scrollbarWidth, 12);
    assert.equal(style.minSize.width.intoRaw().value(), 10);
    assert.equal(style.maxSize.height.intoRaw().value(), 40);
    assert.equal(style.aspectRatio, 2);
    assert.equal(style.alignItems, AlignItems.Center);
    assert.equal(style.alignSelf, AlignItems.Stretch);
    assert.equal(style.justifyItems, AlignItems.FlexStart);
    assert.equal(style.justifySelf, AlignItems.FlexEnd);
    assert.equal(style.alignContent, AlignContent.End);
    assert.equal(style.justifyContent, AlignContent.SpaceAround);
    assert.equal(style.textAlign, TextAlign.LegacyCenter);
    assert.equal(style.flexDirection, FlexDirection.Column);
    assert.equal(style.flexWrap, FlexWrap.Wrap);
    assert.equal(style.flexBasis.intoRaw().value(), 44);
    assert.equal(style.flexGrow, 2);
    assert.equal(style.flexShrink, 3);
    assert.equal(style.gridTemplateRows[0], rowTrack);
    assert.equal(style.gridTemplateColumns[0], columnTrack);
    assert.equal(style.gridAutoRows[0], autoRow);
    assert.equal(style.gridAutoColumns[0], autoColumn);
    assert.equal(style.gridAutoFlow, GridAutoFlow.ColumnDense);
    assert.equal(style.gridTemplateAreas[0], area);
    assert.deepEqual(style.gridTemplateColumnNames, [["left"]]);
    assert.deepEqual(style.gridTemplateRowNames, [["top"]]);
    assert.deepEqual(style.gridRow, new Line(rowPlacement, { type: "Auto" }));
    assert.equal(style.gridColumn, columnPlacement);
    assert.deepEqual(style.grid_row, new Line(rowPlacement, { type: "Auto" }));
    style.grid_row = new Line(gridPlacementSpan(4), { type: "Auto" });
    assert.deepEqual(style.gridRow, new Line(gridPlacementSpan(4), { type: "Auto" }));
    assert.equal(style.grid_column, columnPlacement);
    style.grid_column = new Line(gridPlacementLine(5), { type: "Auto" });
    assert.deepEqual(style.gridColumn, new Line(gridPlacementLine(5), { type: "Auto" }));
    assert.equal(new Style({ flexDirection: FlexDirection.Row, flex_direction: FlexDirection.Column })
        .flexDirection, FlexDirection.Row);
});
test("Dimension resolution follows Rust MaybeResolve behavior", () => {
    assert.equal(maybeResolveDimension(Dimension.auto(), undefined), undefined);
    assert.equal(maybeResolveDimension(Dimension.auto(), 5), undefined);
    assert.equal(maybeResolveDimension(Dimension.length(1), undefined), 1);
    assert.equal(maybeResolveDimension(Dimension.length(1), -5), 1);
    assert.equal(maybeResolveDimension(Dimension.percent(1), undefined), undefined);
    assert.equal(maybeResolveDimension(Dimension.percent(1), 5), 5);
    assert.equal(maybeResolveDimension(Dimension.percent(5), -5), -25);
    assert.equal(Dimension.percent(0.5).maybeResolve(200), 100);
    assert.equal(Dimension.percent(0.5).maybe_resolve(undefined), undefined);
    assert.equal(LengthPercentage.percent(0.25).maybeResolve(200), 50);
    assert.equal(LengthPercentage.percent(0.25).maybe_resolve(undefined), undefined);
    assert.equal(LengthPercentageAuto.auto().maybeResolve(200), undefined);
    assert.equal(LengthPercentageAuto.percent(0.25).maybe_resolve(200), 50);
});
test("dimension conversion helpers mirror Rust constructors", () => {
    assert.equal(zero(), 0);
    assert.equal(zero(Dimension).intoRaw().tag(), CompactLengthTag.Length);
    assert.equal(auto(Dimension).intoRaw().tag(), CompactLengthTag.Auto);
    assert.equal(length(7), 7);
    assert.equal(length(7, Dimension).intoRaw().value(), 7);
    assert.equal(length(8, { from_length: Dimension.from_length }).intoRaw().value(), 8);
    assert.equal(percent(0.25), 0.25);
    assert.equal(percent(0.25, LengthPercentage).intoRaw().tag(), CompactLengthTag.Percent);
    assert.equal(percent(0.5, { from_percent: LengthPercentage.from_percent }).intoRaw().tag(), CompactLengthTag.Percent);
    assert.equal(minContent(MaxTrackSizingFunction).intoRaw().tag(), CompactLengthTag.MinContent);
    assert.equal(maxContent(MaxTrackSizingFunction).intoRaw().tag(), CompactLengthTag.MaxContent);
    assert.equal(fitContent(LengthPercentage.length(12), MaxTrackSizingFunction).intoRaw().tag(), CompactLengthTag.FitContentPx);
    assert.equal(fitContent(LengthPercentage.percent(0.5), { fit_content: MaxTrackSizingFunction.fit_content })
        .intoRaw()
        .tag(), CompactLengthTag.FitContentPercent);
    assert.equal(min_content(MaxTrackSizingFunction).isMinContent(), true);
    assert.equal(max_content(MaxTrackSizingFunction).isMaxContent(), true);
    assert.equal(fit_content(LengthPercentage.length(12), MaxTrackSizingFunction).isFitContent(), true);
    assert.equal(CompactLength.LENGTH_TAG, CompactLengthTag.Length);
    assert.equal(CompactLength.PERCENT_TAG, CompactLengthTag.Percent);
    assert.equal(CompactLength.AUTO_TAG, CompactLengthTag.Auto);
    assert.equal(CompactLength.FR_TAG, CompactLengthTag.Fr);
    assert.equal(CompactLength.MIN_CONTENT_TAG, CompactLengthTag.MinContent);
    assert.equal(CompactLength.MAX_CONTENT_TAG, CompactLengthTag.MaxContent);
    assert.equal(CompactLength.FIT_CONTENT_PX_TAG, CompactLengthTag.FitContentPx);
    assert.equal(CompactLength.FIT_CONTENT_PERCENT_TAG, CompactLengthTag.FitContentPercent);
    assert.equal(CompactLength.ZERO.tag(), CompactLengthTag.Length);
    assert.equal(CompactLength.ZERO.value(), 0);
    assert.equal(CompactLength.AUTO.tag(), CompactLengthTag.Auto);
    assert.equal(CompactLength.MIN_CONTENT.tag(), CompactLengthTag.MinContent);
    assert.equal(CompactLength.MAX_CONTENT.tag(), CompactLengthTag.MaxContent);
    assert.equal(CompactLength.fromLength(3).value(), 3);
    assert.equal(CompactLength.fromPercent(0.25).tag(), CompactLengthTag.Percent);
    assert.equal(CompactLength.fromFr(2).tag(), CompactLengthTag.Fr);
    assert.notEqual(CompactLength.ZERO, CompactLength.ZERO);
    assert.equal(CompactLength.from_length(3).value(), 3);
    assert.equal(CompactLength.from_percent(0.25).tag(), CompactLengthTag.Percent);
    assert.equal(CompactLength.from_fr(2).tag(), CompactLengthTag.Fr);
    assert.equal(CompactLength.min_content().is_min_content(), true);
    assert.equal(CompactLength.max_content().is_max_content(), true);
    assert.equal(CompactLength.fit_content_px(40).is_fit_content(), true);
    assert.equal(CompactLength.fit_content_percent(0.4).uses_percentage(), true);
    assert.equal(CompactLength.fit_content(LengthPercentage.percent(0.5)).tag(), CompactLengthTag.FitContentPercent);
    assert.equal(CompactLength.ZERO.is_zero(), true);
    assert.equal(CompactLength.percent(0.5).is_length_or_percentage(), true);
    assert.equal(CompactLength.AUTO.is_auto(), true);
    assert.equal(CompactLength.MAX_CONTENT.is_max_or_fit_content(), true);
    assert.equal(CompactLength.AUTO.is_max_content_alike(), true);
    assert.equal(CompactLength.MIN_CONTENT.is_min_or_max_content(), true);
    assert.equal(CompactLength.MAX_CONTENT.is_intrinsic(), true);
    assert.equal(CompactLength.fr(1).is_fr(), true);
    assert.equal(CompactLength.percent(0.5).resolved_percentage_size(200), 100);
    const lengthPercentage = LengthPercentage.percent(0.25);
    const lengthPercentageAuto = LengthPercentageAuto.fromLengthPercentage(lengthPercentage);
    assert.equal(lengthPercentageAuto.intoRaw().tag(), CompactLengthTag.Percent);
    assert.equal(lengthPercentageAuto.intoRaw().value(), 0.25);
    assert.equal(LengthPercentage.ZERO.intoRaw().tag(), CompactLengthTag.Length);
    assert.equal(LengthPercentage.ZERO.intoRaw().value(), 0);
    assert.equal(LengthPercentage.fromLength(7).intoRaw().value(), 7);
    assert.equal(LengthPercentage.fromPercent(0.75).intoRaw().tag(), CompactLengthTag.Percent);
    assert.notEqual(LengthPercentage.ZERO, LengthPercentage.ZERO);
    assert.equal(LengthPercentage.from_length(7).into_raw().value(), 7);
    assert.equal(LengthPercentage.from_percent(0.75).into_raw().tag(), CompactLengthTag.Percent);
    assert.equal(LengthPercentage.from_raw(CompactLength.length(4)).into_raw().value(), 4);
    assert.equal(LengthPercentageAuto.ZERO.intoRaw().tag(), CompactLengthTag.Length);
    assert.equal(LengthPercentageAuto.AUTO.intoRaw().tag(), CompactLengthTag.Auto);
    assert.equal(LengthPercentageAuto.fromLength(8).intoRaw().value(), 8);
    assert.equal(LengthPercentageAuto.fromPercent(0.25).intoRaw().tag(), CompactLengthTag.Percent);
    assert.notEqual(LengthPercentageAuto.AUTO, LengthPercentageAuto.AUTO);
    assert.equal(LengthPercentageAuto.from_length(8).into_raw().value(), 8);
    assert.equal(LengthPercentageAuto.from_percent(0.25).into_raw().tag(), CompactLengthTag.Percent);
    assert.equal(LengthPercentageAuto.from_length_percentage(lengthPercentage).into_raw().value(), 0.25);
    assert.equal(LengthPercentageAuto.from_raw(CompactLength.auto()).is_auto(), true);
    assert.equal(LengthPercentageAuto.percent(0.5).resolve_to_option(200), 100);
    assert.equal(Dimension.length(5).intoOption(), 5);
    assert.equal(Dimension.percent(0.5).intoOption(), undefined);
    assert.equal(Dimension.auto().intoOption(), undefined);
    assert.equal(Dimension.ZERO.intoRaw().tag(), CompactLengthTag.Length);
    assert.equal(Dimension.ZERO.intoRaw().value(), 0);
    assert.equal(Dimension.AUTO.intoRaw().tag(), CompactLengthTag.Auto);
    assert.equal(Dimension.fromLength(9).intoOption(), 9);
    assert.equal(Dimension.fromPercent(0.5).tag(), CompactLengthTag.Percent);
    assert.notEqual(Dimension.AUTO, Dimension.AUTO);
    assert.equal(Dimension.from_length(9).into_option(), 9);
    assert.equal(Dimension.from_percent(0.5).tag(), CompactLengthTag.Percent);
    assert.equal(Dimension.from_length_percentage(lengthPercentage).into_raw().tag(), CompactLengthTag.Percent);
    assert.equal(Dimension.from_length_percentage_auto(LengthPercentageAuto.auto()).is_auto(), true);
    assert.equal(Dimension.from_raw(CompactLength.length(11)).value(), 11);
    const fitContentLength = CompactLength.fitContent(LengthPercentage.length(12));
    assert.equal(fitContentLength.tag(), CompactLengthTag.FitContentPx);
    assert.equal(fitContentLength.value(), 12);
    const fitContentPercent = CompactLength.fitContent(LengthPercentage.percent(0.5));
    assert.equal(fitContentPercent.tag(), CompactLengthTag.FitContentPercent);
    assert.equal(fitContentPercent.value(), 0.5);
    assert.deepEqual(dimensionRectFromLengths(1, 2, 3, 4).map((value) => value.intoRaw().value()), new Rect(1, 2, 3, 4));
    assert.deepEqual(dimensionRectFromPercent(0.1, 0.2, 0.3, 0.4).map((value) => value.intoRaw().tag()), new Rect(CompactLengthTag.Percent, CompactLengthTag.Percent, CompactLengthTag.Percent, CompactLengthTag.Percent));
});
test("Size<Dimension> resolution and aspect ratio match Rust helpers", () => {
    assert.deepEqual(maybeResolveDimensionSize(dimensionSizeFromLengths(5, 5), Size.none()), new Size(5, 5));
    assert.deepEqual(maybeResolveDimensionSize(dimensionSizeFromPercent(5, 5), new Size(5, 5)), new Size(25, 25));
    assert.deepEqual(maybeResolveLengthPercentageSize(new Size(LengthPercentage.length(5), LengthPercentage.percent(0.5)), new Size(undefined, 20)), new Size(5, 10));
    assert.deepEqual(maybeResolveLengthPercentageAutoSize(new Size(LengthPercentageAuto.auto(), LengthPercentageAuto.percent(0.5)), new Size(10, undefined)), new Size(undefined, undefined));
    assert.deepEqual(new Size(100, undefined).maybeApplyAspectRatio(2), new Size(100, 50));
    assert.deepEqual(new Size(undefined, 50).maybeApplyAspectRatio(2), new Size(100, 50));
});
test("ResolveOrZero helpers mirror Rust fallback behavior", () => {
    assert.equal(resolveDimensionOrZero(Dimension.auto(), 100), 0);
    assert.equal(resolveDimensionOrZero(Dimension.percent(0.5), undefined), 0);
    assert.equal(resolveDimensionOrZero(Dimension.percent(0.5), 100), 50);
    assert.equal(Dimension.percent(0.5).resolveOrZero(100), 50);
    assert.equal(Dimension.auto().resolve_or_zero(100), 0);
    assert.equal(resolveLengthPercentageOrZero(LengthPercentage.percent(0.5), undefined), 0);
    assert.equal(resolveLengthPercentageOrZero(LengthPercentage.percent(0.5), 100), 50);
    assert.equal(LengthPercentage.percent(0.5).resolveOrZero(100), 50);
    assert.equal(LengthPercentage.percent(0.5).resolve_or_zero(undefined), 0);
    assert.equal(resolveLengthPercentageAutoOrZero(LengthPercentageAuto.auto(), 100), 0);
    assert.equal(resolveLengthPercentageAutoOrZero(LengthPercentageAuto.percent(0.5), undefined), 0);
    assert.equal(resolveLengthPercentageAutoOrZero(LengthPercentageAuto.percent(0.5), 100), 50);
    assert.equal(LengthPercentageAuto.percent(0.5).resolveOrZero(100), 50);
    assert.equal(LengthPercentageAuto.auto().resolve_or_zero(100), 0);
    assert.deepEqual(resolveDimensionSizeOrZero(new Size(Dimension.length(5), Dimension.percent(0.5)), new Size(undefined, 20)), new Size(5, 10));
    assert.deepEqual(resolveLengthPercentageSizeOrZero(new Size(LengthPercentage.length(5), LengthPercentage.percent(0.5)), new Size(undefined, 20)), new Size(5, 10));
    assert.deepEqual(resolveLengthPercentageAutoSizeOrZero(new Size(LengthPercentageAuto.auto(), LengthPercentageAuto.percent(0.5)), new Size(10, undefined)), new Size(0, 0));
    assert.deepEqual(resolveDimensionRectOrZero(new Rect(Dimension.length(1), Dimension.percent(0.5), Dimension.auto(), Dimension.percent(0.25)), new Size(10, 20)), new Rect(1, 5, 0, 5));
    assert.deepEqual(new Size(Dimension.percent(0.25), Dimension.length(12)).maybe_resolve(new Size(200, undefined)), new Size(50, 12));
    assert.deepEqual(new Size(LengthPercentage.percent(0.25), LengthPercentage.length(12)).resolve_or_zero(new Size(undefined, undefined)), new Size(0, 12));
    assert.deepEqual(new Rect(LengthPercentage.percent(0.1), LengthPercentage.length(2), LengthPercentage.percent(0.25), LengthPercentage.length(4)).resolveOrZero(new Size(200, 100)), new Rect(20, 2, 25, 4));
    assert.deepEqual(new Rect(LengthPercentageAuto.percent(0.1), LengthPercentageAuto.length(2), LengthPercentageAuto.auto(), LengthPercentageAuto.percent(0.25)).resolve_or_zero(100), new Rect(10, 2, 0, 25));
});
test("MaybeResolve and ResolveOrZero trait surfaces mirror Rust utility exports", () => {
    const dimensionMaybe = Dimension.percent(0.5);
    const lengthMaybe = LengthPercentage.percent(0.25);
    const autoMaybe = LengthPercentageAuto.auto();
    const dimensionResolve = Dimension.percent(0.5);
    const lengthResolve = LengthPercentage.percent(0.25);
    const autoResolve = LengthPercentageAuto.auto();
    assert.equal(dimensionMaybe.maybeResolve(200), 100);
    assert.equal(lengthMaybe.maybe_resolve(200), 50);
    assert.equal(autoMaybe.maybeResolve(200), undefined);
    assert.equal(dimensionResolve.resolveOrZero(undefined), 0);
    assert.equal(lengthResolve.resolve_or_zero(200), 50);
    assert.equal(autoResolve.resolveOrZero(200), 0);
});
test("geometry axis helpers mirror Rust primitives", () => {
    const rect = new Rect(1, 2, 3, 4);
    assert.equal(AbsoluteAxis.otherAxis(AbsoluteAxis.Horizontal), AbsoluteAxis.Vertical);
    assert.equal(AbsoluteAxis.otherAxis(AbsoluteAxis.Vertical), AbsoluteAxis.Horizontal);
    assert.equal(AbsoluteAxis.other_axis(AbsoluteAxis.Horizontal), AbsoluteAxis.Vertical);
    assert.equal(absoluteAxisOther(AbsoluteAxis.Horizontal), AbsoluteAxis.Vertical);
    assert.equal(AbstractAxis.other(AbstractAxis.Inline), AbstractAxis.Block);
    assert.equal(AbstractAxis.other(AbstractAxis.Block), AbstractAxis.Inline);
    assert.equal(AbstractAxis.asAbsNaive(AbstractAxis.Inline), AbsoluteAxis.Horizontal);
    assert.equal(AbstractAxis.asAbsNaive(AbstractAxis.Block), AbsoluteAxis.Vertical);
    assert.equal(AbstractAxis.as_abs_naive(AbstractAxis.Block), AbsoluteAxis.Vertical);
    assert.equal(abstractAxisOther(AbstractAxis.Inline), AbstractAxis.Block);
    assert.equal(abstractAxisAsAbsoluteNaive(AbstractAxis.Block), AbsoluteAxis.Vertical);
    assert.deepEqual(Rect.ZERO, Rect.zero());
    assert.deepEqual(Rect.zero(Dimension).map((value) => value.intoRaw().tag()), new Rect(CompactLengthTag.Length, CompactLengthTag.Length, CompactLengthTag.Length, CompactLengthTag.Length));
    assert.deepEqual(Rect.auto(Dimension).map((value) => value.intoRaw().tag()), new Rect(CompactLengthTag.Auto, CompactLengthTag.Auto, CompactLengthTag.Auto, CompactLengthTag.Auto));
    assert.deepEqual(Rect.length(3), new Rect(3, 3, 3, 3));
    assert.deepEqual(Rect.length(3, Dimension).map((value) => value.intoRaw().value()), new Rect(3, 3, 3, 3));
    assert.deepEqual(Rect.length(4, { from_length: Dimension.from_length }).map((value) => value.intoRaw().value()), new Rect(4, 4, 4, 4));
    assert.deepEqual(Rect.percent(0.25, LengthPercentage).map((value) => value.intoRaw().tag()), new Rect(CompactLengthTag.Percent, CompactLengthTag.Percent, CompactLengthTag.Percent, CompactLengthTag.Percent));
    assert.deepEqual(Rect.percent(0.25, { from_percent: LengthPercentage.from_percent }).map((value) => value.intoRaw().tag()), new Rect(CompactLengthTag.Percent, CompactLengthTag.Percent, CompactLengthTag.Percent, CompactLengthTag.Percent));
    assert.deepEqual(Rect.maxContent(MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Rect(CompactLengthTag.MaxContent, CompactLengthTag.MaxContent, CompactLengthTag.MaxContent, CompactLengthTag.MaxContent));
    assert.deepEqual(Rect.new(1, 2, 3, 4), rect);
    assert.deepEqual(Rect.from_length(1, 2, 3, 4), rect);
    assert.deepEqual(Rect.from_percent(0.1, 0.2, 0.3, 0.4), new Rect(0.1, 0.2, 0.3, 0.4));
    assert.deepEqual(Rect.min_content(MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Rect(CompactLengthTag.MinContent, CompactLengthTag.MinContent, CompactLengthTag.MinContent, CompactLengthTag.MinContent));
    assert.deepEqual(Rect.max_content(MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Rect(CompactLengthTag.MaxContent, CompactLengthTag.MaxContent, CompactLengthTag.MaxContent, CompactLengthTag.MaxContent));
    assert.deepEqual(Rect.fit_content(LengthPercentage.length(6), MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Rect(CompactLengthTag.FitContentPx, CompactLengthTag.FitContentPx, CompactLengthTag.FitContentPx, CompactLengthTag.FitContentPx));
    assert.deepEqual(Rect.fitContent(LengthPercentage.percent(0.5), {
        fit_content: MaxTrackSizingFunction.fit_content,
    }).map((value) => value.intoRaw().tag()), new Rect(CompactLengthTag.FitContentPercent, CompactLengthTag.FitContentPercent, CompactLengthTag.FitContentPercent, CompactLengthTag.FitContentPercent));
    assert.deepEqual(rect.zip_size(new Size(10, 20), (value, context) => value + context), new Rect(11, 12, 23, 24));
    assert.deepEqual(rect.horizontal_components(), new Line(1, 2));
    assert.deepEqual(rect.vertical_components(), new Line(3, 4));
    assert.equal(rect.gridAxisSum(AbsoluteAxis.Horizontal), 3);
    assert.equal(rect.gridAxisSum(AbsoluteAxis.Vertical), 7);
    assert.equal(rect.grid_axis_sum(AbsoluteAxis.Vertical), 7);
    assert.equal(rect_horizontal_axis_sum(rect), 3);
    assert.equal(rect_vertical_axis_sum(rect), 7);
    assert.equal(rect.horizontalAxisSum(), 3);
    assert.equal(rect.verticalAxisSum(), 7);
    assert.equal(rect.horizontal_axis_sum(), 3);
    assert.equal(rect.vertical_axis_sum(), 7);
    assert.deepEqual(rect.sumAxes(), new Size(3, 7));
    assert.deepEqual(rect.sum_axes(), new Size(3, 7));
    assert.deepEqual(rect_sum_axes(rect), new Size(3, 7));
    assert.deepEqual(rect_add(rect, new Rect(10, 20, 30, 40)), new Rect(11, 22, 33, 44));
    assert.equal(rect.mainAxisSum(FlexDirection.Row), 3);
    assert.equal(rect.crossAxisSum(FlexDirection.Row), 7);
    assert.equal(rect.main_axis_sum(FlexDirection.Row), 3);
    assert.equal(rect.cross_axis_sum(FlexDirection.Row), 7);
    assert.equal(rect.mainAxisSum(FlexDirection.Column), 7);
    assert.equal(rect.crossAxisSum(FlexDirection.Column), 3);
    assert.equal(rect.mainStart(FlexDirection.Row), 1);
    assert.equal(rect.mainEnd(FlexDirection.Row), 2);
    assert.equal(rect.crossStart(FlexDirection.Row), 3);
    assert.equal(rect.crossEnd(FlexDirection.Row), 4);
    assert.equal(rect.main_start(FlexDirection.Row), 1);
    assert.equal(rect.main_end(FlexDirection.Row), 2);
    assert.equal(rect.cross_start(FlexDirection.Row), 3);
    assert.equal(rect.cross_end(FlexDirection.Row), 4);
    assert.equal(rect.mainStart(FlexDirection.Column), 3);
    assert.equal(rect.mainEnd(FlexDirection.Column), 4);
    assert.equal(rect.crossStart(FlexDirection.Column), 1);
    assert.equal(rect.crossEnd(FlexDirection.Column), 2);
    const zeroRect = Rect.ZERO;
    zeroRect.left = 99;
    assert.deepEqual(Rect.ZERO, Rect.zero());
    assert.deepEqual(Rect.MIN_CONTENT, new Rect(AvailableSpace.minContent(), AvailableSpace.minContent(), AvailableSpace.minContent(), AvailableSpace.minContent()));
    assert.deepEqual(Rect.MAX_CONTENT, new Rect(AvailableSpace.maxContent(), AvailableSpace.maxContent(), AvailableSpace.maxContent(), AvailableSpace.maxContent()));
    assert.deepEqual(Rect.minContent(), Rect.MIN_CONTENT);
    assert.deepEqual(Rect.maxContent(), Rect.MAX_CONTENT);
    assert.deepEqual(Rect.min_content(), Rect.MIN_CONTENT);
    assert.deepEqual(Rect.max_content(), Rect.MAX_CONTENT);
    assert.deepEqual(Line.TRUE, Line.true());
    assert.deepEqual(Line.FALSE, Line.false());
    assert.deepEqual(Line.ZERO, Line.zero());
    assert.deepEqual(Line.zero(), new Line(0, 0));
    assert.deepEqual(Line.MIN_CONTENT, new Line(AvailableSpace.minContent(), AvailableSpace.minContent()));
    assert.deepEqual(Line.MAX_CONTENT, new Line(AvailableSpace.maxContent(), AvailableSpace.maxContent()));
    assert.deepEqual(Line.minContent(), Line.MIN_CONTENT);
    assert.deepEqual(Line.maxContent(), Line.MAX_CONTENT);
    assert.deepEqual(Line.min_content(), Line.MIN_CONTENT);
    assert.deepEqual(Line.max_content(), Line.MAX_CONTENT);
    assert.deepEqual(Line.zero(Dimension).map((value) => value.intoRaw().tag()), new Line(CompactLengthTag.Length, CompactLengthTag.Length));
    assert.deepEqual(Line.auto(LengthPercentageAuto).map((value) => value.intoRaw().tag()), new Line(CompactLengthTag.Auto, CompactLengthTag.Auto));
    assert.deepEqual(Line.length(3), new Line(3, 3));
    assert.deepEqual(Line.length(4, { from_length: Dimension.from_length }).map((value) => value.intoRaw().value()), new Line(4, 4));
    assert.deepEqual(Line.percent(0.25, LengthPercentage).map((value) => value.intoRaw().tag()), new Line(CompactLengthTag.Percent, CompactLengthTag.Percent));
    assert.deepEqual(Line.percent(0.25, { from_percent: LengthPercentage.from_percent }).map((value) => value.intoRaw().tag()), new Line(CompactLengthTag.Percent, CompactLengthTag.Percent));
    assert.deepEqual(Line.fitContent(LengthPercentage.length(6), MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Line(CompactLengthTag.FitContentPx, CompactLengthTag.FitContentPx));
    assert.deepEqual(Line.min_content(MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Line(CompactLengthTag.MinContent, CompactLengthTag.MinContent));
    assert.deepEqual(Line.max_content(MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Line(CompactLengthTag.MaxContent, CompactLengthTag.MaxContent));
    assert.deepEqual(Line.fit_content(LengthPercentage.length(6), MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Line(CompactLengthTag.FitContentPx, CompactLengthTag.FitContentPx));
    assert.deepEqual(Line.fitContent(LengthPercentage.percent(0.5), {
        fit_content: MaxTrackSizingFunction.fit_content,
    }).map((value) => value.intoRaw().tag()), new Line(CompactLengthTag.FitContentPercent, CompactLengthTag.FitContentPercent));
    assert.equal(new Line(5, 8).sum(), 13);
    const size = new Size(10, 20);
    assert.deepEqual(Size.ZERO, Size.zero());
    assert.deepEqual(Size.MIN_CONTENT, AvailableSpaceSize.minContent());
    assert.deepEqual(Size.MAX_CONTENT, AvailableSpaceSize.maxContent());
    assert.deepEqual(Size.zero(Dimension).map((value) => value.intoRaw().tag()), new Size(CompactLengthTag.Length, CompactLengthTag.Length));
    assert.deepEqual(Size.auto(Dimension).map((value) => value.intoRaw().tag()), new Size(CompactLengthTag.Auto, CompactLengthTag.Auto));
    assert.deepEqual(Size.length(3), new Size(3, 3));
    assert.deepEqual(Size.length(3, Dimension).map((value) => value.intoRaw().value()), new Size(3, 3));
    assert.deepEqual(Size.length(4, { from_length: Dimension.from_length }).map((value) => value.intoRaw().value()), new Size(4, 4));
    assert.deepEqual(Size.percent(0.25, LengthPercentage).map((value) => value.intoRaw().tag()), new Size(CompactLengthTag.Percent, CompactLengthTag.Percent));
    assert.deepEqual(Size.percent(0.25, { from_percent: LengthPercentage.from_percent }).map((value) => value.intoRaw().tag()), new Size(CompactLengthTag.Percent, CompactLengthTag.Percent));
    assert.deepEqual(Size.fitContent(LengthPercentage.percent(0.5), MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Size(CompactLengthTag.FitContentPercent, CompactLengthTag.FitContentPercent));
    assert.deepEqual(Size.fitContent(LengthPercentage.percent(0.5), {
        fit_content: MaxTrackSizingFunction.fit_content,
    }).map((value) => value.intoRaw().tag()), new Size(CompactLengthTag.FitContentPercent, CompactLengthTag.FitContentPercent));
    assert.deepEqual(Size.minContent(), AvailableSpaceSize.minContent());
    assert.deepEqual(Size.maxContent(), AvailableSpaceSize.maxContent());
    assert.deepEqual(Size.min_content(), AvailableSpaceSize.minContent());
    assert.deepEqual(Size.max_content(), AvailableSpaceSize.maxContent());
    assert.deepEqual(Size.min_content(MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Size(CompactLengthTag.MinContent, CompactLengthTag.MinContent));
    assert.deepEqual(Size.max_content(MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Size(CompactLengthTag.MaxContent, CompactLengthTag.MaxContent));
    assert.deepEqual(Size.fit_content(LengthPercentage.percent(0.5), MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Size(CompactLengthTag.FitContentPercent, CompactLengthTag.FitContentPercent));
    assert.deepEqual(Size.NONE, Size.none());
    assert.deepEqual(Size.new(1, 2), new Size(1, 2));
    assert.deepEqual(Size.some(1, 2), new Size(1, 2));
    assert.deepEqual(Size.fromCross(FlexDirection.Row, 7), new Size(undefined, 7));
    assert.deepEqual(Size.fromCross(FlexDirection.Column, 7), new Size(7, undefined));
    assert.deepEqual(Size.from_cross(FlexDirection.Row, 7), new Size(undefined, 7));
    assert.deepEqual(Size.from_lengths(8, 9), new Size(8, 9));
    assert.deepEqual(Size.fromLengths(8, 9, Dimension).map((value) => value.intoRaw().value()), new Size(8, 9));
    assert.deepEqual(Size.from_lengths(8, 9, { from_length: Dimension.from_length }).map((value) => value.intoRaw().value()), new Size(8, 9));
    assert.deepEqual(Size.fromPercent(0.25, 0.5), new Size(0.25, 0.5));
    assert.deepEqual(Size.fromPercent(0.25, 0.5, Dimension).map((value) => value.intoRaw().tag()), new Size(CompactLengthTag.Percent, CompactLengthTag.Percent));
    assert.deepEqual(Size.from_percent(0.25, 0.5, { from_percent: Dimension.from_percent }).map((value) => value.intoRaw().value()), new Size(0.25, 0.5));
    assert.deepEqual(size.mapWidth((value) => value + 1), new Size(11, 20));
    assert.deepEqual(size.mapHeight((value) => value + 2), new Size(10, 22));
    assert.deepEqual(size.map_width((value) => value + 1), new Size(11, 20));
    assert.deepEqual(size.map_height((value) => value + 2), new Size(10, 22));
    assert.deepEqual(size.zip_map(new Size(1, 2), (left, right) => left + right), new Size(11, 22));
    assert.equal(size.main(FlexDirection.Row), 10);
    assert.equal(size.cross(FlexDirection.Row), 20);
    assert.equal(size.main(FlexDirection.Column), 20);
    assert.equal(size.cross(FlexDirection.Column), 10);
    assert.deepEqual(size.withMain(FlexDirection.Column, 30), new Size(10, 30));
    assert.deepEqual(size.withCross(FlexDirection.Column, 40), new Size(40, 20));
    assert.deepEqual(size.with_main(FlexDirection.Column, 30), new Size(10, 30));
    assert.deepEqual(size.with_cross(FlexDirection.Column, 40), new Size(40, 20));
    assert.deepEqual(size.mapMain(FlexDirection.Row, (value) => value + 5), new Size(15, 20));
    assert.deepEqual(size.mapCross(FlexDirection.Row, (value) => value + 6), new Size(10, 26));
    assert.deepEqual(size.map_main(FlexDirection.Row, (value) => value + 5), new Size(15, 20));
    assert.deepEqual(size.map_cross(FlexDirection.Row, (value) => value + 6), new Size(10, 26));
    size.setMain(FlexDirection.Row, 70);
    size.setCross(FlexDirection.Row, 80);
    size.set_main(FlexDirection.Row, 70);
    size.set_cross(FlexDirection.Row, 80);
    assert.deepEqual(size, new Size(70, 80));
    assert.equal(size.getAbs(AbsoluteAxis.Horizontal), 70);
    assert.equal(size.getAbs(AbsoluteAxis.Vertical), 80);
    assert.equal(size.get_abs(AbsoluteAxis.Vertical), 80);
    assert.equal(size_get_absolute(size, AbsoluteAxis.Horizontal), 70);
    assert.equal(size_get_abs(size, AbsoluteAxis.Vertical), 80);
    assert.equal(size.get(AbstractAxis.Inline), 70);
    assert.equal(size.get(AbstractAxis.Block), 80);
    size.set(AbstractAxis.Block, 30);
    assert.deepEqual(size, new Size(70, 30));
    assert.deepEqual(new Size(10, 30).f32Max(new Size(20, 25)), new Size(20, 30));
    assert.deepEqual(new Size(10, 30).f32Min(new Size(20, 25)), new Size(10, 25));
    assert.deepEqual(new Size(10, 30).f32_max(new Size(20, 25)), new Size(20, 30));
    assert.deepEqual(new Size(10, 30).f32_min(new Size(20, 25)), new Size(10, 25));
    assert.equal(new Size(1, 1).hasNonZeroArea(), true);
    assert.equal(new Size(1, 0).hasNonZeroArea(), false);
    assert.equal(new Size(1, 1).has_non_zero_area(), true);
    assert.equal(new Size(1, 0).has_non_zero_area(), false);
    assert.equal(size_has_non_zero_area(new Size(1, 1)), true);
    assert.deepEqual(size_add(new Size(1, 2), new Size(3, 4)), new Size(4, 6));
    assert.deepEqual(new Size(100, undefined).maybe_apply_aspect_ratio(2), new Size(100, 50));
    assert.deepEqual(new Size(1, undefined).unwrap_or(new Size(2, 3)), new Size(1, 3));
    assert.equal(new Size(1, undefined).both_axis_defined(), false);
    const zeroSize = Size.ZERO;
    zeroSize.width = 99;
    assert.deepEqual(Size.ZERO, Size.zero());
    const point = new Point(40, 50);
    assert.deepEqual(Point.ZERO, Point.zero());
    assert.deepEqual(Point.MIN_CONTENT, new Point(AvailableSpace.minContent(), AvailableSpace.minContent()));
    assert.deepEqual(Point.MAX_CONTENT, new Point(AvailableSpace.maxContent(), AvailableSpace.maxContent()));
    assert.deepEqual(Point.minContent(), Point.MIN_CONTENT);
    assert.deepEqual(Point.maxContent(), Point.MAX_CONTENT);
    assert.deepEqual(Point.min_content(), Point.MIN_CONTENT);
    assert.deepEqual(Point.max_content(), Point.MAX_CONTENT);
    assert.deepEqual(Point.zero(Dimension).map((value) => value.intoRaw().tag()), new Point(CompactLengthTag.Length, CompactLengthTag.Length));
    assert.deepEqual(Point.length(3), new Point(3, 3));
    assert.deepEqual(Point.length(4, { from_length: Dimension.from_length }).map((value) => value.intoRaw().value()), new Point(4, 4));
    assert.deepEqual(Point.percent(0.25, LengthPercentage).map((value) => value.intoRaw().tag()), new Point(CompactLengthTag.Percent, CompactLengthTag.Percent));
    assert.deepEqual(Point.percent(0.25, { from_percent: LengthPercentage.from_percent }).map((value) => value.intoRaw().tag()), new Point(CompactLengthTag.Percent, CompactLengthTag.Percent));
    assert.deepEqual(Point.auto(LengthPercentageAuto).map((value) => value.intoRaw().tag()), new Point(CompactLengthTag.Auto, CompactLengthTag.Auto));
    assert.deepEqual(Point.minContent(MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Point(CompactLengthTag.MinContent, CompactLengthTag.MinContent));
    assert.deepEqual(Point.maxContent(MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Point(CompactLengthTag.MaxContent, CompactLengthTag.MaxContent));
    assert.deepEqual(Point.min_content(MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Point(CompactLengthTag.MinContent, CompactLengthTag.MinContent));
    assert.deepEqual(Point.max_content(MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Point(CompactLengthTag.MaxContent, CompactLengthTag.MaxContent));
    assert.deepEqual(Point.fit_content(LengthPercentage.length(6), MaxTrackSizingFunction).map((value) => value.intoRaw().tag()), new Point(CompactLengthTag.FitContentPx, CompactLengthTag.FitContentPx));
    assert.deepEqual(Point.fitContent(LengthPercentage.percent(0.5), {
        fit_content: MaxTrackSizingFunction.fit_content,
    }).map((value) => value.intoRaw().tag()), new Point(CompactLengthTag.FitContentPercent, CompactLengthTag.FitContentPercent));
    assert.deepEqual(Point.NONE, Point.none());
    assert.equal(point.get(AbstractAxis.Inline), 40);
    assert.equal(point.get(AbstractAxis.Block), 50);
    assert.equal(point.main(FlexDirection.Row), 40);
    assert.equal(point.cross(FlexDirection.Row), 50);
    assert.equal(point.main(FlexDirection.Column), 50);
    assert.equal(point.cross(FlexDirection.Column), 40);
    point.set(AbstractAxis.Inline, 60);
    assert.deepEqual(point.toSize(), new Size(60, 50));
    assert.deepEqual(point.to_size(), new Size(60, 50));
    const zeroPoint = Point.ZERO;
    zeroPoint.x = 99;
    assert.deepEqual(Point.ZERO, Point.zero());
    const minmax = new MinMax("min", "max");
    assert.equal(minmax.min, "min");
    assert.equal(minmax.max, "max");
    assert.equal(TrackSizingFunction.length(12) instanceof MinMax, true);
});
test("AvailableSpace helpers preserve definite and intrinsic constraints", () => {
    assert.deepEqual(AvailableSpace.ZERO, AvailableSpace.definite(0));
    assert.deepEqual(AvailableSpace.MIN_CONTENT, AvailableSpace.minContent());
    assert.deepEqual(AvailableSpace.MAX_CONTENT, AvailableSpace.maxContent());
    assert.deepEqual(AvailableSpace.fromLength(12), AvailableSpace.definite(12));
    assert.deepEqual(AvailableSpace.from_length(12), AvailableSpace.definite(12));
    assert.deepEqual(AvailableSpace.min_content(), AvailableSpace.minContent());
    assert.deepEqual(AvailableSpace.max_content(), AvailableSpace.maxContent());
    assert.equal(AvailableSpace.isDefinite(AvailableSpace.definite(12)), true);
    assert.equal(AvailableSpace.is_definite(AvailableSpace.definite(12)), true);
    assert.equal(AvailableSpace.isDefinite(AvailableSpace.maxContent()), false);
    assert.equal(AvailableSpace.intoOption(AvailableSpace.definite(12)), 12);
    assert.equal(AvailableSpace.into_option(AvailableSpace.definite(12)), 12);
    assert.equal(AvailableSpace.intoOption(AvailableSpace.minContent()), undefined);
    assert.equal(AvailableSpace.unwrapOr(AvailableSpace.maxContent(), 9), 9);
    assert.equal(AvailableSpace.unwrap_or(AvailableSpace.maxContent(), 9), 9);
    assert.equal(AvailableSpace.unwrap(AvailableSpace.definite(12)), 12);
    assert.throws(() => AvailableSpace.unwrap(AvailableSpace.minContent()), /not definite/);
    assert.equal(availableSpaceIntoOption(AvailableSpace.definite(12)), 12);
    assert.equal(available_space_into_option(AvailableSpace.definite(12)), 12);
    assert.equal(availableSpaceIntoOption(AvailableSpace.maxContent()), undefined);
    assert.equal(availableSpaceComputeFreeSpace(AvailableSpace.definite(12), 5), 7);
    assert.equal(available_space_compute_free_space(AvailableSpace.definite(12), 5), 7);
    assert.equal(AvailableSpace.computeFreeSpace(AvailableSpace.definite(12), 5), 7);
    assert.equal(AvailableSpace.compute_free_space(AvailableSpace.definite(12), 5), 7);
    assert.equal(availableSpaceComputeFreeSpace(AvailableSpace.minContent(), 5), 0);
    assert.equal(availableSpaceComputeFreeSpace(AvailableSpace.maxContent(), 5), Number.POSITIVE_INFINITY);
    assert.deepEqual(AvailableSpace.mapDefiniteValue(AvailableSpace.definite(12), (value) => value + 3), AvailableSpace.definite(15));
    assert.deepEqual(AvailableSpace.map_definite_value(AvailableSpace.definite(12), (value) => value + 3), AvailableSpace.definite(15));
    assert.deepEqual(available_space_map_definite_value(AvailableSpace.definite(12), (value) => value + 3), AvailableSpace.definite(15));
    assert.deepEqual(AvailableSpace.mapDefiniteValue(AvailableSpace.minContent(), () => {
        throw new Error("map should not run for intrinsic constraints");
    }), AvailableSpace.minContent());
    assert.equal(AvailableSpace.isRoughlyEqual(AvailableSpace.definite(1), AvailableSpace.definite(1 + Number.EPSILON / 2)), true);
    assert.equal(AvailableSpace.is_roughly_equal(AvailableSpace.definite(1), AvailableSpace.definite(1 + Number.EPSILON / 2)), true);
    assert.equal(available_space_is_roughly_equal(AvailableSpace.definite(1), AvailableSpace.definite(1 + Number.EPSILON / 2)), true);
    assert.equal(available_space_is_definite(AvailableSpace.definite(1)), true);
    assert.equal(AvailableSpace.isRoughlyEqual(AvailableSpace.definite(1), AvailableSpace.definite(1 + Number.EPSILON * 2)), false);
    const zero = AvailableSpace.ZERO;
    zero.type = "MaxContent";
    assert.deepEqual(AvailableSpace.ZERO, AvailableSpace.definite(0));
    assert.deepEqual(AvailableSpaceSize.ZERO, AvailableSpaceSize.zero());
    assert.deepEqual(AvailableSpaceSize.MIN_CONTENT, AvailableSpaceSize.minContent());
    assert.deepEqual(AvailableSpaceSize.MAX_CONTENT, AvailableSpaceSize.maxContent());
    assert.deepEqual(AvailableSpaceSize.MIN_CONTENT, AvailableSpaceSize.min_content());
    assert.deepEqual(AvailableSpaceSize.MAX_CONTENT, AvailableSpaceSize.max_content());
    assert.deepEqual(AvailableSpaceSize.intoOptions(new Size(AvailableSpace.definite(12), AvailableSpace.maxContent())), new Size(12, undefined));
    assert.deepEqual(AvailableSpaceSize.into_options(new Size(AvailableSpace.definite(12), AvailableSpace.maxContent())), new Size(12, undefined));
    assert.deepEqual(size_available_space_into_options(new Size(AvailableSpace.definite(12), AvailableSpace.maxContent())), new Size(12, undefined));
    assert.deepEqual(AvailableSpaceSize.maybeSet(new Size(AvailableSpace.minContent(), AvailableSpace.maxContent()), new Size(undefined, 4)), new Size(AvailableSpace.minContent(), AvailableSpace.definite(4)));
    assert.deepEqual(AvailableSpaceSize.maybe_set(new Size(AvailableSpace.minContent(), AvailableSpace.maxContent()), new Size(undefined, 4)), new Size(AvailableSpace.minContent(), AvailableSpace.definite(4)));
    const zeroSize = AvailableSpaceSize.ZERO;
    zeroSize.width = AvailableSpace.maxContent();
    assert.deepEqual(AvailableSpaceSize.ZERO, AvailableSpaceSize.zero());
});
test("AvailableSpace parity helpers mirror Rust fallback behavior", () => {
    assert.equal(availableSpaceUnwrap(AvailableSpace.definite(12)), 12);
    assert.equal(available_space_unwrap(AvailableSpace.definite(12)), 12);
    assert.throws(() => availableSpaceUnwrap(AvailableSpace.minContent()), /not definite/);
    assert.deepEqual(AvailableSpace.fromOption(9), AvailableSpace.definite(9));
    assert.deepEqual(AvailableSpace.from_option(9), AvailableSpace.definite(9));
    assert.deepEqual(AvailableSpace.fromOption(undefined), AvailableSpace.maxContent());
    let fallbackCalls = 0;
    assert.deepEqual(availableSpaceOrElse(AvailableSpace.definite(10), () => {
        fallbackCalls += 1;
        return AvailableSpace.definite(20);
    }), AvailableSpace.definite(10));
    assert.equal(fallbackCalls, 0);
    assert.deepEqual(available_space_or_else(AvailableSpace.definite(10), () => {
        throw new Error("fallback should not run");
    }), AvailableSpace.definite(10));
    assert.deepEqual(AvailableSpace.orElse(AvailableSpace.definite(10), () => {
        throw new Error("fallback should not run");
    }), AvailableSpace.definite(10));
    assert.deepEqual(AvailableSpace.or_else(AvailableSpace.definite(10), () => {
        throw new Error("fallback should not run");
    }), AvailableSpace.definite(10));
    assert.deepEqual(availableSpaceOrElse(AvailableSpace.minContent(), () => {
        fallbackCalls += 1;
        return AvailableSpace.definite(20);
    }), AvailableSpace.definite(20));
    assert.equal(fallbackCalls, 1);
    assert.deepEqual(AvailableSpace.or(AvailableSpace.maxContent(), AvailableSpace.definite(50)), AvailableSpace.definite(50));
    assert.deepEqual(available_space_or(AvailableSpace.maxContent(), AvailableSpace.definite(50)), AvailableSpace.definite(50));
    assert.deepEqual(AvailableSpace.maybeSet(AvailableSpace.maxContent(), 33), AvailableSpace.definite(33));
    assert.deepEqual(AvailableSpace.maybe_set(AvailableSpace.maxContent(), 33), AvailableSpace.definite(33));
    assert.deepEqual(available_space_maybe_set(AvailableSpace.maxContent(), 33), AvailableSpace.definite(33));
    assert.deepEqual(AvailableSpace.maybeSet(AvailableSpace.minContent(), undefined), AvailableSpace.minContent());
    assert.equal(available_space_unwrap_or(AvailableSpace.maxContent(), 30), 30);
    assert.equal(availableSpaceUnwrapOrElse(AvailableSpace.definite(30), () => {
        throw new Error("fallback should not run");
    }), 30);
    assert.equal(available_space_unwrap_or_else(AvailableSpace.definite(30), () => {
        throw new Error("fallback should not run");
    }), 30);
    assert.equal(AvailableSpace.unwrapOrElse(AvailableSpace.definite(30), () => {
        throw new Error("fallback should not run");
    }), 30);
    assert.equal(AvailableSpace.unwrap_or_else(AvailableSpace.definite(30), () => {
        throw new Error("fallback should not run");
    }), 30);
    assert.equal(availableSpaceUnwrapOrElse(AvailableSpace.maxContent(), () => 40), 40);
    assert.equal(AvailableSpace.unwrapOrElse(AvailableSpace.maxContent(), () => 40), 40);
});
test("Size<AvailableSpace>.maybe_set preserves intrinsic axes without replacement values", () => {
    assert.deepEqual(sizeAvailableSpaceMaybeSet(new Size(AvailableSpace.minContent(), AvailableSpace.maxContent()), new Size(10, undefined)), new Size(AvailableSpace.definite(10), AvailableSpace.maxContent()));
    assert.deepEqual(size_available_space_maybe_set(new Size(AvailableSpace.minContent(), AvailableSpace.maxContent()), new Size(10, undefined)), new Size(AvailableSpace.definite(10), AvailableSpace.maxContent()));
});
test("AvailableSpace MaybeMath helpers mirror Rust intrinsic rules", () => {
    assert.deepEqual(availableSpaceMaybeMin(AvailableSpace.definite(10), 6), AvailableSpace.definite(6));
    assert.deepEqual(availableSpaceMaybeMin(AvailableSpace.definite(Number.NaN), 6), AvailableSpace.definite(6));
    assert.deepEqual(availableSpaceMaybeMin(AvailableSpace.definite(10), undefined), AvailableSpace.definite(10));
    assert.deepEqual(availableSpaceMaybeMin(AvailableSpace.minContent(), 6), AvailableSpace.definite(6));
    assert.deepEqual(availableSpaceMaybeMin(AvailableSpace.maxContent(), undefined), AvailableSpace.maxContent());
    assert.deepEqual(available_space_maybe_min(AvailableSpace.maxContent(), 6), AvailableSpace.definite(6));
    assert.deepEqual(availableSpaceMaybeMax(AvailableSpace.definite(10), 12), AvailableSpace.definite(12));
    assert.deepEqual(availableSpaceMaybeMax(AvailableSpace.definite(Number.NaN), 12), AvailableSpace.definite(12));
    assert.deepEqual(availableSpaceMaybeMax(AvailableSpace.definite(10), undefined), AvailableSpace.definite(10));
    assert.deepEqual(availableSpaceMaybeMax(AvailableSpace.minContent(), 12), AvailableSpace.minContent());
    assert.deepEqual(availableSpaceMaybeMax(AvailableSpace.maxContent(), undefined), AvailableSpace.maxContent());
    assert.deepEqual(available_space_maybe_max(AvailableSpace.definite(10), 12), AvailableSpace.definite(12));
    assert.deepEqual(availableSpaceMaybeClamp(AvailableSpace.definite(10), 12, 20), AvailableSpace.definite(12));
    assert.deepEqual(availableSpaceMaybeClamp(AvailableSpace.definite(10), undefined, 8), AvailableSpace.definite(8));
    assert.deepEqual(availableSpaceMaybeClamp(AvailableSpace.minContent(), 12, 20), AvailableSpace.minContent());
    assert.deepEqual(available_space_maybe_clamp(AvailableSpace.definite(10), undefined, 8), AvailableSpace.definite(8));
    assert.deepEqual(availableSpaceMaybeAdd(AvailableSpace.definite(10), 5), AvailableSpace.definite(15));
    assert.deepEqual(availableSpaceMaybeAdd(AvailableSpace.definite(10), undefined), AvailableSpace.definite(10));
    assert.deepEqual(availableSpaceMaybeAdd(AvailableSpace.maxContent(), 5), AvailableSpace.maxContent());
    assert.deepEqual(available_space_maybe_add(AvailableSpace.definite(10), 5), AvailableSpace.definite(15));
    assert.deepEqual(availableSpaceMaybeSub(AvailableSpace.definite(10), 5), AvailableSpace.definite(5));
    assert.deepEqual(availableSpaceMaybeSub(AvailableSpace.definite(10), undefined), AvailableSpace.definite(10));
    assert.deepEqual(availableSpaceMaybeSub(AvailableSpace.minContent(), 5), AvailableSpace.minContent());
    assert.deepEqual(available_space_maybe_sub(AvailableSpace.definite(10), 5), AvailableSpace.definite(5));
});
test("Size MaybeMath helpers mirror Rust component-wise optional rules", () => {
    assert.equal(maybe_min(10, 4), 4);
    assert.equal(maybe_max(10, 20), 20);
    assert.equal(maybe_clamp(10, 12, 20), 12);
    assert.equal(maybe_min(Number.NaN, 4), 4);
    assert.equal(maybe_max(Number.NaN, 20), 20);
    assert.equal(maybe_clamp(Number.NaN, 12, 20), 20);
    assert.equal(maybe_add(10, 4), 14);
    assert.equal(maybe_sub(10, 4), 6);
    assert.deepEqual(maybeMinSize(new Size(10, 20), new Size(4, undefined)), new Size(4, 20));
    assert.deepEqual(maybeMinSize(new Size(Number.NaN, 20), new Size(4, undefined)), new Size(4, 20));
    assert.deepEqual(maybeMaxSize(new Size(10, 20), new Size(undefined, 30)), new Size(10, 30));
    assert.deepEqual(maybeMaxSize(new Size(Number.NaN, 20), new Size(30, undefined)), new Size(30, 20));
    assert.deepEqual(maybeAddSize(new Size(10, 20), new Size(4, undefined)), new Size(14, 20));
    assert.deepEqual(maybeSubSize(new Size(10, 20), new Size(undefined, 2)), new Size(10, 18));
    assert.deepEqual(maybe_min_size(new Size(10, 20), new Size(4, undefined)), new Size(4, 20));
    assert.deepEqual(maybe_max_size(new Size(10, 20), new Size(undefined, 30)), new Size(10, 30));
    assert.deepEqual(maybe_add_size(new Size(10, 20), new Size(4, undefined)), new Size(14, 20));
    assert.deepEqual(maybe_sub_size(new Size(10, 20), new Size(undefined, 2)), new Size(10, 18));
    assert.deepEqual(maybe_clamp_size(new Size(10, 20), new Size(12, undefined), new Size(undefined, 18)), new Size(12, 18));
    assert.deepEqual(new Size(10, 20).maybeMin(new Size(4, undefined)), new Size(4, 20));
    assert.deepEqual(new Size(10, 20).maybe_max(new Size(undefined, 30)), new Size(10, 30));
    assert.deepEqual(new Size(10, 20).maybeClamp(new Size(12, undefined), new Size(undefined, 18)), new Size(12, 18));
    assert.deepEqual(new Size(10, 20).maybe_add(new Size(4, undefined)), new Size(14, 20));
    assert.deepEqual(new Size(10, 20).maybeSub(new Size(undefined, 2)), new Size(10, 18));
    assert.deepEqual(maybeMinOptionalSize(new Size(10, undefined), new Size(4, 2)), new Size(4, undefined));
    assert.deepEqual(maybeMinOptionalSize(new Size(10, 20), new Size(undefined, 2)), new Size(10, 2));
    assert.deepEqual(maybeSubOptionalSize(new Size(10, undefined), new Size(4, 2)), new Size(6, undefined));
    assert.deepEqual(maybeSubOptionalSize(new Size(10, 20), new Size(undefined, 2)), new Size(10, 18));
    assert.deepEqual(maybe_clamp_optional_size(new Size(10, 20), new Size(12, undefined), new Size(undefined, 18)), new Size(12, 18));
    assert.deepEqual(maybe_min_optional_size(new Size(10, undefined), new Size(4, 2)), new Size(4, undefined));
    assert.deepEqual(maybe_max_optional_size(new Size(10, 20), new Size(undefined, 30)), new Size(10, 30));
    assert.deepEqual(maybe_add_optional_size(new Size(10, 20), new Size(4, undefined)), new Size(14, 20));
    assert.deepEqual(maybe_sub_optional_size(new Size(10, 20), new Size(undefined, 2)), new Size(10, 18));
    assert.deepEqual(new Size(10, undefined).maybe_min(new Size(4, 2)), new Size(4, undefined));
    assert.deepEqual(new Size(10, 20).maybeMax(new Size(undefined, 30)), new Size(10, 30));
    assert.deepEqual(new Size(10, 20).maybe_clamp(new Size(12, undefined), new Size(undefined, 18)), new Size(12, 18));
    assert.deepEqual(new Size(10, 20).maybeAdd(new Size(4, undefined)), new Size(14, 20));
    assert.deepEqual(new Size(10, undefined).maybe_sub(new Size(4, 2)), new Size(6, undefined));
});
test("Alignment and flex direction helpers mirror Rust enum methods", () => {
    assert.equal(alignContentReversed(AlignContent.Start), AlignContent.End);
    assert.equal(AlignContent.reversed(AlignContent.Start), AlignContent.End);
    assert.equal(alignContentReversed(AlignContent.Stretch), AlignContent.End);
    assert.equal(alignContentReversed(AlignContent.Center), AlignContent.Center);
    assert.equal(Overflow.isScrollContainer(Overflow.Visible), false);
    assert.equal(Overflow.isScrollContainer(Overflow.Clip), false);
    assert.equal(Overflow.isScrollContainer(Overflow.Hidden), true);
    assert.equal(Overflow.isScrollContainer(Overflow.Scroll), true);
    assert.equal(Overflow.is_scroll_container(Overflow.Hidden), true);
    assert.equal(overflow_is_scroll_container(Overflow.Scroll), true);
    assert.equal(Overflow.maybeIntoAutomaticMinSize(Overflow.Visible), undefined);
    assert.equal(Overflow.maybeIntoAutomaticMinSize(Overflow.Scroll), 0);
    assert.equal(Overflow.maybe_into_automatic_min_size(Overflow.Scroll), 0);
    assert.equal(overflow_maybe_into_automatic_min_size(Overflow.Visible), undefined);
    assert.equal(Direction.isRtl(Direction.Ltr), false);
    assert.equal(Direction.isRtl(Direction.Rtl), true);
    assert.equal(Direction.is_rtl(Direction.Rtl), true);
    assert.equal(direction_is_rtl(Direction.Ltr), false);
    assert.equal(Float.isFloated(Float.None), false);
    assert.equal(Float.isFloated(Float.Left), true);
    assert.equal(Float.is_floated(Float.Right), true);
    assert.equal(float_is_floated(Float.None), false);
    assert.equal(Float.floatDirection(Float.None), undefined);
    assert.equal(Float.floatDirection(Float.Left), FloatDirection.Left);
    assert.equal(Float.floatDirection(Float.Right), FloatDirection.Right);
    assert.equal(Float.float_direction(Float.Left), FloatDirection.Left);
    assert.equal(float_direction(Float.Right), FloatDirection.Right);
    assert.equal(flexDirectionIsRow(FlexDirection.Row), true);
    assert.equal(FlexDirection.isRow(FlexDirection.Row), true);
    assert.equal(FlexDirection.is_row(FlexDirection.RowReverse), true);
    assert.equal(flex_direction_is_row(FlexDirection.RowReverse), true);
    assert.equal(flexDirectionIsRow(FlexDirection.RowReverse), true);
    assert.equal(flexDirectionIsColumn(FlexDirection.Column), true);
    assert.equal(FlexDirection.isColumn(FlexDirection.Column), true);
    assert.equal(FlexDirection.is_column(FlexDirection.ColumnReverse), true);
    assert.equal(flex_direction_is_column(FlexDirection.ColumnReverse), true);
    assert.equal(flexDirectionIsReverse(FlexDirection.ColumnReverse), true);
    assert.equal(FlexDirection.isReverse(FlexDirection.ColumnReverse), true);
    assert.equal(FlexDirection.is_reverse(FlexDirection.Row), false);
    assert.equal(flex_direction_is_reverse(FlexDirection.RowReverse), true);
    assert.equal(flexDirectionMainAxis(FlexDirection.Row), AbsoluteAxis.Horizontal);
    assert.equal(FlexDirection.mainAxis(FlexDirection.Row), AbsoluteAxis.Horizontal);
    assert.equal(FlexDirection.main_axis(FlexDirection.Column), AbsoluteAxis.Vertical);
    assert.equal(flex_direction_main_axis(FlexDirection.Column), AbsoluteAxis.Vertical);
    assert.equal(flexDirectionMainAxis(FlexDirection.RowReverse), AbsoluteAxis.Horizontal);
    assert.equal(flexDirectionMainAxis(FlexDirection.Column), AbsoluteAxis.Vertical);
    assert.equal(flexDirectionMainAxis(FlexDirection.ColumnReverse), AbsoluteAxis.Vertical);
    assert.equal(flexDirectionCrossAxis(FlexDirection.Row), AbsoluteAxis.Vertical);
    assert.equal(FlexDirection.crossAxis(FlexDirection.Row), AbsoluteAxis.Vertical);
    assert.equal(FlexDirection.cross_axis(FlexDirection.Column), AbsoluteAxis.Horizontal);
    assert.equal(flex_direction_cross_axis(FlexDirection.Column), AbsoluteAxis.Horizontal);
    assert.equal(flexDirectionCrossAxis(FlexDirection.RowReverse), AbsoluteAxis.Vertical);
    assert.equal(flexDirectionCrossAxis(FlexDirection.Column), AbsoluteAxis.Horizontal);
    assert.equal(flexDirectionCrossAxis(FlexDirection.ColumnReverse), AbsoluteAxis.Horizontal);
    assert.equal(GridAutoFlow.isDense(GridAutoFlow.Row), false);
    assert.equal(GridAutoFlow.isDense(GridAutoFlow.ColumnDense), true);
    assert.equal(GridAutoFlow.primaryAxis(GridAutoFlow.RowDense), AbsoluteAxis.Horizontal);
    assert.equal(GridAutoFlow.primaryAxis(GridAutoFlow.Column), AbsoluteAxis.Vertical);
});
test("TaffyTree computes a measured root leaf", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeafWithContext(Style.default(), { width: 100, height: 50 });
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), (_known, _available, _node, context) => {
        assert.ok(context);
        return new Size(context.width, context.height);
    });
    assert.equal(taffy.layout(node).size.width, 100);
    assert.equal(taffy.layout(node).size.height, 50);
});
test("Leaf style size overrides measurement", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeafWithContext(new Style({
        size: new Size(Dimension.length(50), Dimension.auto()),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
        padding: new Rect(LengthPercentage.zero(), LengthPercentage.zero(), LengthPercentage.zero(), LengthPercentage.zero()),
    }), { width: 100, height: 50 });
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), (_known, _available, _node, context) => {
        assert.ok(context);
        return new Size(context.width, context.height);
    });
    assert.equal(taffy.layout(node).size.width, 50);
    assert.equal(taffy.layout(node).size.height, 50);
});
test("Rust XML leaf padding and border override undersized explicit size", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeaf(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.length(12), Dimension.length(12)),
        padding: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
        border: new Rect(LengthPercentage.length(7), LengthPercentage.length(3), LengthPercentage.length(1), LengthPercentage.length(5)),
    }));
    taffy.computeLayout(node, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(node).location, Point.zero());
    assert.deepEqual(taffy.layout(node).size, new Size(22, 14));
});
test("Rust XML leaf padding and border override undersized max size", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const node = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                maxSize: new Size(Dimension.length(12), Dimension.length(12)),
                padding: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
                border: new Rect(LengthPercentage.length(7), LengthPercentage.length(3), LengthPercentage.length(1), LengthPercentage.length(5)),
            }));
            taffy.computeLayout(node, AvailableSpaceSize.maxContent());
            assert.deepEqual(taffy.layout(node).location, Point.zero());
            assert.deepEqual(taffy.layout(node).size, new Size(22, 14));
        }
    }
});
test("Rust XML leaf measured content includes content-box padding and border", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeafWithContext(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Ltr,
        padding: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
        border: new Rect(LengthPercentage.length(7), LengthPercentage.length(3), LengthPercentage.length(1), LengthPercentage.length(5)),
    }), { text: "HHHH" });
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), (_known, _available, _node, context) => {
        assert.ok(context);
        return new Size(context.text.length * 10, 10);
    });
    assert.deepEqual(taffy.layout(node).location, Point.zero());
    assert.deepEqual(taffy.layout(node).size, new Size(62, 24));
});
test("Rust XML leaf measured content includes padding and border variants", () => {
    const cases = [
        {
            style: new Style({
                direction: Direction.Ltr,
                padding: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
            }),
            expected: new Size(52, 18),
        },
        {
            style: new Style({
                direction: Direction.Ltr,
                border: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
            }),
            expected: new Size(52, 18),
        },
        {
            style: new Style({
                direction: Direction.Ltr,
                padding: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
                border: new Rect(LengthPercentage.length(7), LengthPercentage.length(3), LengthPercentage.length(1), LengthPercentage.length(5)),
            }),
            expected: new Size(62, 24),
        },
        {
            style: new Style({
                direction: Direction.Rtl,
                padding: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
                border: new Rect(LengthPercentage.length(7), LengthPercentage.length(3), LengthPercentage.length(1), LengthPercentage.length(5)),
            }),
            expected: new Size(62, 24),
        },
        {
            style: new Style({
                boxSizing: BoxSizing.ContentBox,
                direction: Direction.Rtl,
                padding: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
                border: new Rect(LengthPercentage.length(7), LengthPercentage.length(3), LengthPercentage.length(1), LengthPercentage.length(5)),
            }),
            expected: new Size(62, 24),
        },
    ];
    for (const { style, expected } of cases) {
        const taffy = TaffyTree.new();
        const node = taffy.newLeafWithContext(style, { text: "HHHH" });
        taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), measureText);
        assert.deepEqual(taffy.layout(node).location, Point.zero());
        assert.deepEqual(taffy.layout(node).size, expected);
    }
});
test("Rust XML leaf scrollbars take up measured content space", () => {
    const cases = [
        {
            overflow: new Point(Overflow.Scroll, Overflow.Scroll),
            expectedSize: new Size(35, 25),
            expectedScrollbar: new Size(15, 15),
        },
        {
            overflow: new Point(Overflow.Scroll, Overflow.Visible),
            expectedSize: new Size(20, 25),
            expectedScrollbar: new Size(0, 15),
        },
        {
            overflow: new Point(Overflow.Visible, Overflow.Scroll),
            expectedSize: new Size(35, 10),
            expectedScrollbar: new Size(15, 0),
        },
    ];
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            for (const { overflow, expectedSize, expectedScrollbar } of cases) {
                const taffy = TaffyTree.new();
                const node = taffy.newLeafWithContext(new Style({
                    boxSizing,
                    direction,
                    overflow,
                    scrollbarWidth: 15,
                }), { text: "HH" });
                taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), measureText);
                assert.deepEqual(taffy.layout(node).location, Point.zero());
                assert.deepEqual(taffy.layout(node).size, expectedSize);
                assert.deepEqual(taffy.layout(node).scrollbarSize, expectedScrollbar);
                assert.equal(taffy.layout(node).scrollWidth(), 0);
                assert.equal(taffy.layout(node).scrollHeight(), 0);
            }
        }
    }
});
test("Rust XML leaf scrollbars affect measured available space", () => {
    const text = "HHHHHHHHHHHHHHHHHHHHH";
    const cases = [
        {
            overflow: new Point(Overflow.Scroll, Overflow.Visible),
            expectedAvailable: new Size(AvailableSpace.definite(45), AvailableSpace.definite(30)),
            expectedScrollbar: new Size(0, 15),
            expectedScrollWidth: 165,
        },
        {
            overflow: new Point(Overflow.Visible, Overflow.Scroll),
            expectedAvailable: new Size(AvailableSpace.definite(30), AvailableSpace.definite(45)),
            expectedScrollbar: new Size(15, 0),
            expectedScrollWidth: 180,
        },
    ];
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            for (const { overflow, expectedAvailable, expectedScrollbar, expectedScrollWidth } of cases) {
                const taffy = TaffyTree.new();
                const node = taffy.newLeafWithContext(new Style({
                    boxSizing,
                    direction,
                    overflow,
                    scrollbarWidth: 15,
                    size: new Size(Dimension.length(45), Dimension.length(45)),
                }), { text });
                taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), (known, available, measuredNode, context) => {
                    assert.deepEqual(known, Size.none());
                    assert.deepEqual(available, expectedAvailable);
                    return measureText(known, available, measuredNode, context);
                });
                assert.deepEqual(taffy.layout(node).size, new Size(45, 45));
                assert.deepEqual(taffy.layout(node).scrollbarSize, expectedScrollbar);
                assert.equal(taffy.layout(node).scrollWidth(), expectedScrollWidth);
                assert.equal(taffy.layout(node).scrollHeight(), 0);
            }
        }
    }
});
test("Rust XML leaf scrollbars are overridden by available space", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const child = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                overflow: new Point(Overflow.Scroll, Overflow.Scroll),
                scrollbarWidth: 15,
                flexGrow: 1,
            }));
            const root = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                size: new Size(Dimension.length(2), Dimension.length(4)),
            }), [child]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            assert.deepEqual(taffy.layout(root).location, Point.zero());
            assert.deepEqual(taffy.layout(root).size, new Size(2, 4));
            assert.deepEqual(taffy.layout(child).location, Point.zero());
            assert.deepEqual(taffy.layout(child).size, new Size(2, 4));
            assert.deepEqual(taffy.layout(child).scrollbarSize, new Size(15, 15));
            assert.equal(taffy.layout(child).scrollWidth(), 0);
            assert.equal(taffy.layout(child).scrollHeight(), 0);
        }
    }
});
test("Rust XML leaf padding and border override min and content-box size", () => {
    const cases = [
        {
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Ltr,
            size: new Size(Dimension.auto(), Dimension.auto()),
            minSize: new Size(Dimension.length(0), Dimension.length(0)),
            expected: new Size(22, 14),
        },
        {
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Ltr,
            size: new Size(Dimension.auto(), Dimension.auto()),
            minSize: new Size(Dimension.length(0), Dimension.length(0)),
            expected: new Size(22, 14),
        },
        {
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Rtl,
            size: new Size(Dimension.auto(), Dimension.auto()),
            minSize: new Size(Dimension.length(0), Dimension.length(0)),
            expected: new Size(22, 14),
        },
        {
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Rtl,
            size: new Size(Dimension.auto(), Dimension.auto()),
            minSize: new Size(Dimension.length(0), Dimension.length(0)),
            expected: new Size(22, 14),
        },
        {
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Ltr,
            size: new Size(Dimension.length(12), Dimension.length(12)),
            minSize: new Size(Dimension.auto(), Dimension.auto()),
            expected: new Size(22, 14),
        },
        {
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Ltr,
            size: new Size(Dimension.length(12), Dimension.length(12)),
            minSize: new Size(Dimension.auto(), Dimension.auto()),
            expected: new Size(34, 26),
        },
        {
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Rtl,
            size: new Size(Dimension.length(12), Dimension.length(12)),
            minSize: new Size(Dimension.auto(), Dimension.auto()),
            expected: new Size(22, 14),
        },
        {
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Rtl,
            size: new Size(Dimension.length(12), Dimension.length(12)),
            minSize: new Size(Dimension.auto(), Dimension.auto()),
            expected: new Size(34, 26),
        },
    ];
    for (const { boxSizing, direction, size, minSize, expected } of cases) {
        const taffy = TaffyTree.new();
        const node = taffy.newLeaf(new Style({
            boxSizing,
            direction,
            size,
            minSize,
            padding: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
            border: new Rect(LengthPercentage.length(7), LengthPercentage.length(3), LengthPercentage.length(1), LengthPercentage.length(5)),
        }));
        taffy.computeLayout(node, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(node).location, Point.zero());
        assert.deepEqual(taffy.layout(node).size, expected);
    }
});
test("Rust XML leaf scrollbars are overridden by explicit and max size", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const explicitTree = TaffyTree.new();
            const explicit = explicitTree.newLeaf(new Style({
                boxSizing,
                direction,
                overflow: new Point(Overflow.Scroll, Overflow.Scroll),
                scrollbarWidth: 15,
                size: new Size(Dimension.length(2), Dimension.length(4)),
            }));
            explicitTree.computeLayout(explicit, AvailableSpaceSize.maxContent());
            assert.deepEqual(explicitTree.layout(explicit).location, Point.zero());
            assert.deepEqual(explicitTree.layout(explicit).size, new Size(2, 4));
            assert.deepEqual(explicitTree.layout(explicit).scrollbarSize, new Size(15, 15));
            assert.equal(explicitTree.layout(explicit).scrollWidth(), 0);
            assert.equal(explicitTree.layout(explicit).scrollHeight(), 0);
            const maxTree = TaffyTree.new();
            const max = maxTree.newLeaf(new Style({
                boxSizing,
                direction,
                overflow: new Point(Overflow.Scroll, Overflow.Scroll),
                scrollbarWidth: 15,
                maxSize: new Size(Dimension.length(2), Dimension.length(4)),
            }));
            maxTree.computeLayout(max, AvailableSpaceSize.maxContent());
            assert.deepEqual(maxTree.layout(max).location, Point.zero());
            assert.deepEqual(maxTree.layout(max).size, new Size(2, 4));
            assert.deepEqual(maxTree.layout(max).scrollbarSize, new Size(15, 15));
            assert.equal(maxTree.layout(max).scrollWidth(), 0);
            assert.equal(maxTree.layout(max).scrollHeight(), 0);
        }
    }
});
test("Leaf max-height clamps measured content before final aspect-ratio height floor", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeaf(new Style({
        maxSize: new Size(Dimension.auto(), Dimension.length(20)),
        aspectRatio: 2,
    }));
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), () => new Size(80, 80));
    assert.deepEqual(taffy.layout(node).size, new Size(80, 40));
});
test("leaf aspect-ratio height floor mirrors Rust f32_max with NaN width", () => {
    const output = computeLeafLayout(new LayoutInput({
        runMode: RunMode.PerformLayout,
        sizingMode: SizingMode.InherentSize,
        axis: RequestedAxis.Both,
        knownDimensions: new Size(Number.NaN, 10),
        parentSize: Size.none(),
        availableSpace: AvailableSpaceSize.maxContent(),
        verticalMarginsAreCollapsible: Line.false(),
    }), new Style({ aspectRatio: 2 }), () => Size.zero());
    assert.deepEqual(output.size, new Size(0, 10));
});
function measureText(_known: Size, _available: Size, _node: unknown, context: { text: string } | undefined): Size {
    assert.ok(context);
    return new Size(context.text.length * 10, 10);
}

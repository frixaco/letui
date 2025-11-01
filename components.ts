type View = unknown;

function run(Component: View) {
  function layout() {}
  function paint() {
    const modifiedCells = layout();
  }
}

function Column(opts: ColumnProps, children: View[]) {}
function Text(opts: TextProps) {}

type ColumnProps = {
  padding?: number | `${number} ${number}`;
  gap?: number;
  border?: BorderProps;
};
type TextProps = {
  text: string;
  fg?: number;
  border?: BorderProps;
};
type BorderProps = {
  color?: number;
  style?: "square" | "rounded" | "none";
};

function Row(opts: RowProps, children: View[]) {}
function Button(opts: ButtonProps) {}
function InputBox(opts: InputBoxProps) {}
type RowProps = {};
type ButtonProps = {};
type InputBoxProps = {
  text: string;
  border: BorderProps;
  onBlur: () => void;
  onFocus: () => void;
  onType: () => void;
};

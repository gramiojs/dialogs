// Engine
export { createDialogs, dialogs, type DialogsOptions } from "./plugin.ts";
export {
	type CallbackOptions,
	type DialogCallback,
	type DialogCodec,
	makeCodec,
} from "./callback.ts";
export {
	type BuilderWindow,
	Dialog,
	type DialogConfig,
	type DialogOptions,
} from "./dialog.ts";
export { Window, type WindowOptions } from "./window.ts";
export { defineWindow, type WindowTyping } from "./builder.ts";
export {
	DialogBuilder,
	defineDialog,
	type TypedButtonOptions,
	type TypedClickCtx,
	type TypedDialog,
	type TypedDialogConfig,
	type TypedEventCtx,
	type TypedInputCtx,
	type TypedNav,
	type TypedWindowOptions,
} from "./typed.ts";
export { DialogManager, type StartOptions } from "./manager.ts";
export { DialogRegistry } from "./registry.ts";
export {
	type DialogContext,
	type DialogStack,
	type GetStackKey,
	StackRepository,
} from "./context.ts";

// Types
export {
	type AccessCheck,
	type AccessDeniedHandler,
	type AnyData,
	type ButtonStyle,
	type ClickCtx,
	type DataDict,
	type DialogEventCtx,
	type DialogEvents,
	type DialogNav,
	type DialogRef,
	type Getter,
	type StartParamsOf,
	type StatesOf,
	type I18nResolver,
	type InputCtx,
	type InputWidget,
	type Keyboard,
	type MediaType,
	type MediaWidget,
	type RawButton,
	type RenderContext,
	type RenderData,
	type RenderedMedia,
	type ReplyRequest,
	ShowMode,
	StartMode,
	type Stringable,
	type TextSource,
	type TextWidget,
	type Translator,
	type WhenCondition,
} from "./types.ts";

// Text widgets
export {
	asText,
	Case,
	Const,
	Format,
	List,
	Multi,
	Progress,
	T,
} from "./widgets/text.ts";

// Keyboard widgets
export {
	Back,
	Button,
	type ButtonChrome,
	type ButtonOptions,
	Cancel,
	Next,
	type OnClick,
	type LinkOptions,
	Start,
	type SwitchInlineOptions,
	SwitchInlineQuery,
	SwitchTo,
	Url,
	WebApp,
	type WebAppOptions,
} from "./widgets/button.ts";
export { Column, Group, type GroupOptions, Row } from "./widgets/group.ts";

// Stateful widgets
export {
	Checkbox,
	type CheckboxOptions,
	Counter,
	type CounterOptions,
	getSelected,
	getToggle,
	isChecked,
	type ItemId,
	type ItemsGetter,
	type ItemState,
	type ItemText,
	Multiselect,
	type MultiselectOptions,
	type OnItemClick,
	Radio,
	type RadioOptions,
	Select,
	type SelectOptions,
	Toggle,
	type ToggleOptions,
} from "./widgets/stateful.ts";

// Form widgets
export {
	addTag,
	Confirm,
	type ConfirmOptions,
	getPin,
	getRating,
	getSlider,
	getTags,
	PinPad,
	type PinPadOptions,
	Rating,
	type RatingOptions,
	Slider,
	type SliderOptions,
	Stepper,
	type StepperOptions,
	TagInput,
	type TagInputOptions,
} from "./widgets/forms.ts";
export {
	type FieldValidator,
	Form,
	type FormField,
	type FormOptions,
	getFormValues,
	type StandardSchemaV1,
} from "./widgets/wizard.ts";

// Data / selection widgets
export {
	Accordion,
	type AccordionOptions,
	type AccordionSection,
	AsyncSelect,
	type AsyncSelectOptions,
	Breadcrumbs,
	type BreadcrumbsOptions,
	getTab,
	Grid,
	type GridOptions,
	type TabItem,
	Tabs,
	type TabsOptions,
} from "./widgets/data.ts";

// Payments (Telegram Stars) & AI streaming
export { StarsButton, type StarsButtonOptions } from "./widgets/payments.ts";
export { stream, type StreamOptions } from "./widgets/stream.ts";

// Live / animated widgets
export {
	Countdown,
	type CountdownOptions,
	LiveProgress,
	type LiveProgressOptions,
	Spinner,
	type SpinnerOptions,
	typing,
	withTyping,
} from "./widgets/live.ts";

// Telegram-native widgets
export {
	ContactRequest,
	getReactions,
	getSharedChat,
	getSharedUsers,
	LocationButton,
	Poll,
	type PollOptions,
	Reactions,
	type ReactionsOptions,
	RequestChat,
	type RequestChatOptions,
	RequestUser,
	type RequestUserOptions,
} from "./widgets/native.ts";

// Complex widgets
export { Calendar, type CalendarOptions } from "./widgets/calendar.ts";
export {
	CurrentPage,
	FirstPage,
	LastPage,
	NextPage,
	type PagerButtonOptions,
	pageState,
	PrevPage,
	ScrollingGroup,
	type ScrollingGroupOptions,
} from "./widgets/scroll.ts";
export {
	ListGroup,
	type ListGroupOptions,
	listItemId,
} from "./widgets/list.ts";

// Media widgets
export {
	Barcode,
	type BarcodeOptions,
	type BarcodeType,
	DynamicMedia,
	MediaScroll,
	type MediaScrollOptions,
	mediaScrollPage,
	QR,
	type QROptions,
	StaticMedia,
} from "./widgets/media.ts";

// Chart widgets
export {
	BarChart,
	type BarChartItem,
	type BarChartOptions,
	Gauge,
	type GaugeOptions,
	Sparkline,
	type SparklineOptions,
} from "./widgets/chart.ts";

// Input widgets
export { getInput, TextInput, type TextInputOptions } from "./widgets/input.ts";

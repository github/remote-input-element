export default class RemoteInputElement extends HTMLElement {
  readonly input: HTMLInputElement | HTMLTextAreaElement | undefined;
  src: string;
}

declare global {
  interface Window {
    RemoteInputElement: RemoteInputElement
  }
}

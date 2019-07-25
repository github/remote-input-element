export default class RemoteInputElement extends HTMLElement {
  readonly input: HTMLInputElement | HTMLTextAreaElement | undefined;
  src: string;
}

export { cn } from "cn";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route params are user input: check them before they reach a uuid column, which would throw. */
export const isUuid = (value: string) => UUID.test(value);

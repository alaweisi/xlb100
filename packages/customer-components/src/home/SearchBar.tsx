import { MagnifyingGlass } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import type { CustomerHomeComponentProps } from "./homeTypes.js";

export function SearchBar({
  instance,
  actions,
}: CustomerHomeComponentProps<"search_bar">) {
  const [query, setQuery] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void actions.submit?.invoke({ query: query.trim() });
  }

  return (
    <form className="xlb-home-search" role="search" onSubmit={submit}>
      <MagnifyingGlass aria-hidden="true" size={24} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={instance.props.placeholder}
        aria-label={instance.props.accessibleLabel}
      />
      <button type="submit" aria-label="提交搜索">搜索</button>
    </form>
  );
}

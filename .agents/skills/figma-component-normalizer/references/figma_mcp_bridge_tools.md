# figma-mcp-bridge tool reference

Use the actual MCP tools exposed by `Liar0320/figma-mcp-bridge`.

## Read tools

- list_files
- get_document
- get_selection
- get_node
- get_styles
- get_metadata
- get_design_context
- get_variable_defs
- get_design_tokens
- get_token_usage
- audit_design_tokens
- propose_design_tokens
- export_design_tokens
- get_screenshot
- save_screenshots

## Write tools

- create_frame
- create_component
- create_instance
- combine_as_variants
- set_variant_properties
- manage_component_properties
- set_component_properties
- set_exposed_instance
- create_text
- create_rectangle
- append_children
- find_nodes
- set_position
- set_size
- set_fills
- set_strokes
- set_corner_radius
- set_text_content
- set_text_style
- set_layout_mode
- set_padding
- set_item_spacing
- set_node_name
- rename_node
- delete_node
- batch_mutation

## Token tools

- get_variable_defs
- get_design_tokens
- get_token_usage
- audit_design_tokens
- export_design_tokens
- apply_tokens

## Token creation tools

Use only when the user explicitly asks to extend the design system:

- create_design_tokens
- propose_design_tokens

## Safety

- Prefer read tools before write tools.
- Prefer batch_mutation for multiple changes.
- Use dry-run behavior where supported.
- Do not modify unrelated nodes.
- If multiple files are connected, pass fileKey.
- In batch_mutation, use tmp: references for newly created nodes.

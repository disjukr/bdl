from bdl.parser.bdl_parser import parse_bdl

with open("../bdl/ast.bdl", "r") as f:
    bdl_code = f.read()

ast = parse_bdl(bdl_code)


def print_field(field, indent="    ", index=None):
    field_name = bdl_code[field.name.start : field.name.end]
    field_type = bdl_code[
        field.field_type.value_type.start : field.field_type.value_type.end
    ]

    container_info = ""
    if field.field_type.container:
        if field.field_type.container.key_type:
            key_type = bdl_code[
                field.field_type.container.key_type.start : field.field_type.container.key_type.end
            ]
            container_info = f"[{key_type}]"
        else:
            container_info = "[]"

    optional_mark = "?" if field.question else ""
    comma = "," if field.comma else ""

    index_str = f"{index}. " if index is not None else ""
    print(
        f"{indent}{index_str}{field_name}{optional_mark}: {field_type}{container_info}{comma}"
    )


for statement in ast.statements:
    if statement.type == "Struct":
        struct_name = bdl_code[statement.name.start : statement.name.end]
        print(f"Found struct: {struct_name}")

        print(f"  Fields ({len(statement.fields)}):")
        for i, field in enumerate(statement.fields):
            print_field(field, index=i + 1)

    elif statement.type == "Union":
        union_name = bdl_code[statement.name.start : statement.name.end]
        print(f"Found union: {union_name}")

        print(f"  Items ({len(statement.items)}):")
        for i, item in enumerate(statement.items):
            item_name = bdl_code[item.name.start : item.name.end]
            comma = "," if item.comma else ""
            print(f"    {i + 1}. {item_name}{comma}")

            if item.struct:
                print(f"      Fields ({len(item.struct.fields)}):")
                for j, field in enumerate(item.struct.fields):
                    print_field(field, indent="        ", index=j + 1)

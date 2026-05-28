from live2d_llm_expression.scanner import scan_live2d_resources


def test_scanner_can_find_yachiyo_files(yachiyo_dir):
    resources = scan_live2d_resources(yachiyo_dir)

    assert resources.model3_path and resources.model3_path.name.endswith(".model3.json")
    assert resources.cdi3_path and resources.cdi3_path.name.endswith(".cdi3.json")
    assert resources.physics3_path and resources.physics3_path.name.endswith(".physics3.json")
    assert resources.vtube_path and resources.vtube_path.name.endswith(".vtube.json")
    assert len(resources.exp3_paths) == 4

    ignored_names = {path.name for path in resources.ignored_paths}
    assert "items_pinned_to_model.json" in ignored_names
    assert any(name.endswith(".xyplugin.json") for name in ignored_names)


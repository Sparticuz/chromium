# Patch content/browser/renderer_host/render_process_host_impl.cc
# Comment out the CHECK(render_process_host->InSameStoragePartition(...))
# assertion that crashes when reusing render processes across storage partitions.
# Three consecutive lines need to be commented out.
s|^\(  \)\(\s*\)\(CHECK(render_process_host->InSameStoragePartition(\)$|  // \2\3|
s|^\(  \)\(\s*\)\(browser_context->GetStoragePartition(site_instance,\)$|  // \2\3|
s|^\(  \)\(\s*\)\(false /\* can_create \*/)));\)$|  // \2\3|

# hostile-repo (demo fixture)

Every "malicious" pattern in this folder points at `*.example.invalid` and nothing here
is ever executed. It exists only so `onopen` has something to find.

    node bin/onopen.js examples/hostile-repo

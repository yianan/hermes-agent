"""Non-redirection write primitives must preserve sensitive-file approval policy (#143198)."""


def test_sed_write_subcommand_is_dangerous_for_ssh_and_hermes_config():
    from tools.approval_detection import detect_dangerous_command

    for command in (
        'sed -n "w $HOME/.ssh/config" "$HOME/payload"',
        'sed -n "w $HOME/.hermes/config.yaml" "$HOME/payload"',
    ):
        assert detect_dangerous_command(command)[0], command


def test_sed_write_to_authorized_keys_is_hardline_blocked():
    from tools.approval_detection import detect_hardline_command

    command = 'sed -n "w $HOME/.ssh/authorized_keys" "$HOME/payload"'
    assert detect_hardline_command(command)[0]


def test_unrelated_sed_read_or_tempfile_write_stays_unclassified():
    from tools.approval_detection import detect_dangerous_command, detect_hardline_command

    assert not detect_dangerous_command('sed -n "1,5p" "$HOME/.ssh/config"')[0]
    assert not detect_dangerous_command('sed -n "w /tmp/output" input.txt')[0]
    assert not detect_hardline_command('sed -n "w /tmp/output" input.txt')[0]

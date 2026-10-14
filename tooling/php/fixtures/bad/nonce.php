<?php
/**
 * Reads POST data without a nonce check.
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

/**
 * Handler.
 *
 * @return string
 */
function blixis_handle(): string {
	return isset( $_POST['value'] ) ? sanitize_text_field( wp_unslash( $_POST['value'] ) ) : '';
}

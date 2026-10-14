<?php
/**
 * Smoke helper (BWB-035): saves a second design system with a different background so the smoke test can check the version,
 * the history and the rollback. Run with: wp eval-file /fixtures/blixis-second-save.php
 *
 * @package Blixis\Tooling
 */

if ( ! defined( 'BLIXIS_DEV_FIXTURES' ) || true !== BLIXIS_DEV_FIXTURES || 'local' !== wp_get_environment_type() ) {
	WP_CLI::error( 'Refusing to run: this is not the disposable development stack.' );
}

$blixis_current = \Blixis\Theme\DesignSystemStore::current();
if ( null === $blixis_current ) {
	WP_CLI::error( 'No saved design system to build on.' );
}
$blixis_tokens                      = $blixis_current['tokens'];
$blixis_tokens['color-bg']['value'] = '#ffffff';
$blixis_result                      = \Blixis\Theme\DesignSystemStore::apply( $blixis_tokens, 'custom' );
if ( ! $blixis_result['ok'] ) {
	WP_CLI::error( 'Second save failed: ' . $blixis_result['reason'] );
}

<?php
/**
 * Prints "<path>\t<sha256>\t<canonical json>" for each fixture file given as an argument.
 * Used by tests/fixtures/src/parity.test.ts to compare the PHP and TypeScript implementations.
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

// CLI tooling only: STDERR/STDOUT writes and file functions are intended.
// phpcs:disable WordPress.WP.AlternativeFunctions,WordPress.PHP.DiscouragedPHPFunctions

require_once dirname( __DIR__ ) . '/src/StrictJson.php';
require_once dirname( __DIR__ ) . '/src/Fixtures.php';

use Blixis\Tooling\Fixtures;

$blixis_argv = $_SERVER['argv'] ?? array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- CLI argument list.
if ( ! is_array( $blixis_argv ) ) {
	$blixis_argv = array();
}
$blixis_args = array_values( array_map( 'strval', array_slice( $blixis_argv, 1 ) ) );
if ( array() === $blixis_args ) {
	fwrite( STDERR, "usage: canonicalize.php <file.fixture.json>...\n" );
	exit( 2 );
}
foreach ( $blixis_args as $blixis_path ) {
	$blixis_fixture = 'raw:' === substr( $blixis_path, 0, 4 )
		? Fixtures::decode( (string) substr( $blixis_path, 4 ) )
		: Fixtures::load( $blixis_path );
	fwrite( STDOUT, $blixis_path . "\t" . Fixtures::canonical_hash( $blixis_fixture ) . "\t" . Fixtures::canonical_json( $blixis_fixture ) . "\n" );
}

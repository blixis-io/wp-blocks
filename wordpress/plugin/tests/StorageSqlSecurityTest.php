<?php
/**
 * Storage key and SQL preparation guard.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Storage\MetaKeys;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Query sites remain confined to reviewed prepared SQL and validated meta keys. */
final class StorageSqlSecurityTest extends TestCase {
	/** SQL execution methods may consume only the local prepared $sql variable. */
	public function test_all_wpdb_query_calls_use_prepared_sql(): void {
		$root     = \dirname( __DIR__ ) . '/src';
		$iterator = new \RecursiveIteratorIterator( new \RecursiveDirectoryIterator( $root, \FilesystemIterator::SKIP_DOTS ) );
		$calls    = [];
		foreach ( $iterator as $file ) {
			if ( ! $file instanceof \SplFileInfo || 'php' !== $file->getExtension() ) {
				continue;
			}
			$source = (string) \file_get_contents( $file->getPathname() ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Test source scan.
			\preg_match_all( '/->(query|get_results|get_var|get_col|get_row)\s*\(([^)]*)\)/', $source, $matches, PREG_SET_ORDER );
			foreach ( $matches as $match ) {
				$calls[] = $file->getFilename() . ':' . $match[1];
				$this->assertSame( '$sql', \trim( \explode( ',', $match[2] )[0] ), $file->getFilename() );
			}
		}
		$this->assertSame(
			[
				'WpdbDatabase.php:get_results',
				'WpdbDatabase.php:get_var',
				'WpdbDatabase.php:get_var',
				'WpdbDatabase.php:get_col',
				'WpdbDatabase.php:get_col',
				'WpdbDatabase.php:query',
			],
			$calls
		);
		$source = (string) \file_get_contents( $root . '/Storage/WpdbDatabase.php' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Test source scan.
		$this->assertSame( 8, \substr_count( $source, '->prepare(' ) );
		$this->assertSame( 6, \substr_count( $source, '%i' ) );
	}

	/** Injection-shaped locale and key strings never become meta addresses. */
	public function test_meta_keys_reject_sql_injection_shapes(): void {
		foreach ( [ "en_US' OR 1=1--", 'nl_NL;DROP TABLE', 'en_US\\0', '../en_US', 'en_US%00', 'en_US`', "en_US\0" ] as $locale ) {
			$this->assertFalse( MetaKeys::is_valid_locale( $locale ) );
			$this->assertFalse( MetaKeys::is_valid_key( '_blixis_content_' . $locale ) );
		}
	}
}

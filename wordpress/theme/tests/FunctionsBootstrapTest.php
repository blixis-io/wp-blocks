<?php
/**
 * The theme bootstrap loads every class file (PHPUnit autoloads, WordPress does not).
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use PHPUnit\Framework\TestCase;

/**
 * A class file that functions.php does not require is a fatal error in real WordPress while every unit test stays green.
 */
final class FunctionsBootstrapTest extends TestCase {
	/** Every `src/*.php` file is required by functions.php. */
	public function test_functions_php_requires_every_src_file(): void {
		$theme     = \dirname( __DIR__ );
		$functions = (string) \file_get_contents( $theme . '/functions.php' );
		$missing   = [];
		foreach ( (array) \glob( $theme . '/src/*.php' ) as $file ) {
			$name = \basename( (string) $file );
			if ( ! \str_contains( $functions, "/src/{$name}'" ) ) {
				$missing[] = $name;
			}
		}
		$this->assertSame( [], $missing, 'functions.php must require_once these src files: ' . \implode( ', ', $missing ) );
	}
}

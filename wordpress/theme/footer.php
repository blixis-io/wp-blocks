<?php
/**
 * Site footer: end of the main landmark, footer and document end.
 *
 * @package Blixis\Theme
 */

?>
</main>
<footer class="site-footer">
	<p>
		<?php
		printf(
			/* translators: 1: site name, 2: year. */
			esc_html__( '%1$s © %2$s', 'blixis' ),
			esc_html( get_bloginfo( 'name' ) ),
			esc_html( (string) wp_date( 'Y' ) )
		);
		?>
	</p>
</footer>
<?php wp_footer(); ?>
</body>
</html>
